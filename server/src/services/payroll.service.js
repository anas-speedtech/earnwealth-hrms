const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { PayrollErrorCodes } = require('../errors/PayrollErrorCodes');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');
const { generatePayslipPDF, getPayslipFilename } = require('../utils/pdfPayslip');

let prisma;

function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

const PAGE_SIZE = 20;

// Default standard salary split, matching the organisation's salary register:
//   Basic = 50% of CTC; HRA = 30% of Basic; PF = 12% of min(Basic, cap 15,000)
//   ESIC = 4% total (3.25% employer / 0.75% employee); Special = remainder.
// Stored in a single-row `salary_rules` table so HR can reconfigure the
// split from the Payroll page without touching code.
const DEFAULT_SALARY_RULES = {
  basicPct: 50,
  hraPctOfBasic: 30,
  pfPct: 12,
  pfCap: 15000,
  esicEmployerPct: 3.25,
  esicEmployeePct: 0.75,
  esicWageCeiling: 21000,
  professionTax: 200,
  workingDaysMonth: 31,
  notes:
    'PF: 12% of 15,000 (i.e. 1,800 fixed) if Basic Salary is 15,000 or more; otherwise 12% of the actual Basic Salary.\n' +
    'ESIC: 4% of gross wages (0.75% employee & 3.25% employer).\n' +
    'Employer PF and employer ESIC are reference contributions, not deducted from net pay.',
};

async function ensureSalaryRulesTable(prismaClient) {
  try {
    await prismaClient.$queryRawUnsafe('SELECT 1 FROM salary_rules LIMIT 1');
  } catch {
    await prismaClient.$queryRawUnsafe(`
      CREATE TABLE salary_rules (
        id INT NOT NULL DEFAULT 1 PRIMARY KEY,
        basicPct DECIMAL(5,2) NOT NULL DEFAULT 50,
        hraPctOfBasic DECIMAL(5,2) NOT NULL DEFAULT 30,
        pfPct DECIMAL(5,2) NOT NULL DEFAULT 12,
        pfCap DECIMAL(12,2) NOT NULL DEFAULT 15000,
        esicEmployerPct DECIMAL(5,2) NOT NULL DEFAULT 3.25,
        esicEmployeePct DECIMAL(5,2) NOT NULL DEFAULT 0.75,
        esicWageCeiling DECIMAL(12,2) NOT NULL DEFAULT 21000,
        professionTax DECIMAL(12,2) NOT NULL DEFAULT 200,
        workingDaysMonth INT NOT NULL DEFAULT 31,
        notes TEXT NULL,
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )
    `);
    const d = DEFAULT_SALARY_RULES;
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO salary_rules (id, basicPct, hraPctOfBasic, pfPct, pfCap,
        esicEmployerPct, esicEmployeePct, esicWageCeiling, professionTax,
        workingDaysMonth, notes)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.basicPct, d.hraPctOfBasic, d.pfPct, d.pfCap,
      d.esicEmployerPct, d.esicEmployeePct, d.esicWageCeiling, d.professionTax,
      d.workingDaysMonth, d.notes
    );
  }
}

function readSalaryRulesRow(row) {
  const d = DEFAULT_SALARY_RULES;
  if (!row) return { ...d };
  return {
    basicPct: Number(row.basicPct) || 0,
    hraPctOfBasic: Number(row.hraPctOfBasic) || 0,
    pfPct: Number(row.pfPct) || 0,
    pfCap: Number(row.pfCap) || 0,
    esicEmployerPct: Number(row.esicEmployerPct) || 0,
    esicEmployeePct: Number(row.esicEmployeePct) || 0,
    esicWageCeiling: Number(row.esicWageCeiling) || 0,
    professionTax: Number(row.professionTax) || 0,
    workingDaysMonth: Number(row.workingDaysMonth) || 31,
    notes: row.notes || d.notes,
  };
}

// Pure split engine. The client mirrors these formulas in
// client/src/utils/salary.ts so the HR form preview matches what is saved.
function standardSalarySplit(ctc, rules) {
  const ctcNum = Number(ctc) || 0;
  const round = (n) => Math.round(n * 100) / 100;

  const basic = round(ctcNum * (Number(rules.basicPct) || 0) / 100);
  const hra = round(basic * (Number(rules.hraPctOfBasic) || 0) / 100);
  const pfBase = Math.min(basic, Number(rules.pfCap) || 0);
  const pfEmployee = round(pfBase * (Number(rules.pfPct) || 0) / 100);
  const pfEmployer = pfEmployee;
  const esicBase = Math.min(ctcNum, Number(rules.esicWageCeiling) || 0);
  const esiEmployee = round(esicBase * (Number(rules.esicEmployeePct) || 0) / 100);
  const esiEmployer = round(esicBase * (Number(rules.esicEmployerPct) || 0) / 100);
  const pt = Number(rules.professionTax) || 0;

  const special = Math.max(0, round(ctcNum - basic - hra - pfEmployee - esiEmployee - pt));

  const earnings = [
    { name: 'Basic Salary', code: 'BASIC', type: 'EARNING', amount: basic },
    { name: 'House Rent Allowance', code: 'HRA', type: 'EARNING', amount: hra },
    { name: 'Special Allowance', code: 'SPL', type: 'EARNING', amount: special },
  ];
  const deductions = [
    { name: 'Provident Fund (Employee)', code: 'PF', type: 'DEDUCTION', amount: pfEmployee },
    { name: 'ESI (Employee)', code: 'ESI_EMP', type: 'DEDUCTION', amount: esiEmployee },
    { name: 'Profession Tax', code: 'PT', type: 'DEDUCTION', amount: pt },
  ];
  // Employer contributions are reference-only: shown on the payslip, not
  // deducted from net pay (matches the register's Employer PF / ESI columns).
  const employerContributions = [
    { name: 'Provident Fund (Employer)', code: 'PF_ER', type: 'MEMO', amount: pfEmployer },
    { name: 'ESI (Employer)', code: 'ESI_ER', type: 'MEMO', amount: esiEmployer },
  ];

  const grossEarnings = round(earnings.reduce((s, c) => s + c.amount, 0));
  const totalDeductions = round(deductions.reduce((s, c) => s + c.amount, 0));
  return {
    ctc: ctcNum,
    earnings,
    deductions,
    employerContributions,
    grossEarnings,
    totalDeductions,
    netPay: round(grossEarnings - totalDeductions),
  };
}

// Standard payhead catalog used to seed the table on first access — the
// usual Indian payroll components. Editing the catalog in the HR UI then
// customizes what every employee structure offers.
const DEFAULT_PAYHEADS = [
  { code: 'BASIC', name: 'Basic Salary', type: 'EARNING', sortOrder: 1 },
  { code: 'HRA', name: 'House Rent Allowance', type: 'EARNING', sortOrder: 2 },
  { code: 'DA', name: 'Dearness Allowance', type: 'EARNING', sortOrder: 3 },
  { code: 'LWA', name: 'Leave Travel Allowance', type: 'EARNING', sortOrder: 4 },
  { code: 'PLA', name: 'Professional Allowance', type: 'EARNING', sortOrder: 5 },
  { code: 'CBA', name: 'Conveyance Allowance', type: 'EARNING', sortOrder: 6 },
  { code: 'PF', name: 'Provident Fund', type: 'DEDUCTION', sortOrder: 20 },
  { code: 'ESI', name: 'ESI Contribution', type: 'DEDUCTION', sortOrder: 21 },
  { code: 'PT', name: 'Professional Tax', type: 'DEDUCTION', sortOrder: 22 },
  { code: 'TDS', name: 'Tax Deducted at Source', type: 'DEDUCTION', sortOrder: 23 },
];

async function ensurePayheadTable(prismaClient) {
  try {
    await prismaClient.$queryRawUnsafe('SELECT 1 FROM salary_payheads LIMIT 1');
  } catch {
    await prismaClient.$queryRawUnsafe(`
      CREATE TABLE salary_payheads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        type ENUM('EARNING','DEDUCTION') NOT NULL DEFAULT 'EARNING',
        description VARCHAR(255) NULL,
        isFixedByDefault TINYINT(1) NOT NULL DEFAULT 0,
        sortOrder INT NOT NULL DEFAULT 0,
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )
    `);
    // Seed the standard catalog so the HR UI has a starting point to edit.
    for (const seed of DEFAULT_PAYHEADS) {
      await prismaClient.$queryRawUnsafe(
        `INSERT INTO salary_payheads (code, name, type, description, isFixedByDefault, sortOrder, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, NULL, 0, ?, 1, NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE id = id`,
        seed.code, seed.name, seed.type, seed.sortOrder
      );
    }
  }
}

class PayrollService {
  // ---- Role checks ----

  static canManagePayroll(reqUser) {
    return [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role);
  }

  // ---- Salary payheads (the configurable "salary headers") ----

  static async listPayheads(reqUser, { activeOnly = false } = {}) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage salary payheads.', 403);
    }
    const prismaClient = getPrisma();
    await ensurePayheadTable(prismaClient);
    const rows = await prismaClient.$queryRawUnsafe(
      activeOnly
        ? `SELECT id, code, name, type, description, isFixedByDefault, sortOrder, isActive FROM salary_payheads
           WHERE isActive = 1 ORDER BY type ASC, sortOrder ASC, id ASC`
        : `SELECT id, code, name, type, description, isFixedByDefault, sortOrder, isActive FROM salary_payheads
           ORDER BY type ASC, sortOrder ASC, id ASC`
    );
    return rows.map((r) => ({
      id: String(r.id),
      code: r.code,
      name: r.name,
      type: r.type,
      description: r.description || '',
      isFixedByDefault: Boolean(r.isFixedByDefault),
      sortOrder: Number(r.sortOrder) || 0,
      isActive: Boolean(r.isActive),
    }));
  }

  static async createPayhead(reqUser, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage salary payheads.', 403);
    }
    const code = String(data.code || '').trim().toUpperCase();
    const name = String(data.name || '').trim();
    if (!code || !name) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Payhead code and name are required.', 400);
    }
    if (!['EARNING', 'DEDUCTION'].includes(data.type)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, "Payhead type must be 'EARNING' or 'DEDUCTION'.", 400);
    }
    const prismaClient = getPrisma();
    await ensurePayheadTable(prismaClient);
    const dup = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM salary_payheads WHERE code = ? LIMIT 1',
      code
    );
    if (dup && dup.length) {
      throw new AppError(AppErrorCodes.CONFLICT, `Payhead code "${code}" already exists.`, 409);
    }
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO salary_payheads (code, name, type, description, isFixedByDefault, sortOrder, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(3), NOW(3))`,
      code,
      name,
      data.type,
      data.description || null,
      data.isFixedByDefault ? 1 : 0,
      Number(data.sortOrder) || 0
    );
    const created = await prismaClient.$queryRawUnsafe('SELECT id FROM salary_payheads WHERE code = ? LIMIT 1', code);
    logger.info('Salary payhead created', { code, by: reqUser.email });
    return { id: String(created[0].id), code, name, type: data.type, description: data.description || '' };
  }

  static async updatePayhead(reqUser, id, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage salary payheads.', 403);
    }
    const prismaClient = getPrisma();
    await ensurePayheadTable(prismaClient);
    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT * FROM salary_payheads WHERE id = ? LIMIT 1',
      Number(id)
    );
    if (!existing || !existing.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Salary payhead not found.', 404);
    }
    const sets = [];
    const params = [];
    const name = data.name !== undefined ? String(data.name).trim() : existing[0].name;
    if (name !== existing[0].name) { sets.push('name = ?'); params.push(name); }
    if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description || null); }
    if (data.isFixedByDefault !== undefined) { sets.push('isFixedByDefault = ?'); params.push(data.isFixedByDefault ? 1 : 0); }
    if (data.sortOrder !== undefined) { sets.push('sortOrder = ?'); params.push(Number(data.sortOrder) || 0); }
    // Type cannot change once in use: employee structures already reference
    // the old value and payroll math would silently re-classify amounts.
    if (data.type !== undefined && ['EARNING', 'DEDUCTION'].includes(data.type)) {
      sets.push('type = ?'); params.push(data.type);
    }
    if (data.isActive !== undefined) { sets.push('isActive = ?'); params.push(data.isActive ? 1 : 0); }
    if (sets.length) {
      sets.push('updatedAt = NOW(3)');
      params.push(Number(id));
      await prismaClient.$executeRawUnsafe(
        `UPDATE salary_payheads SET ${sets.join(', ')} WHERE id = ?`,
        ...params
      );
    }
    const updated = await prismaClient.$queryRawUnsafe(
      'SELECT * FROM salary_payheads WHERE id = ? LIMIT 1',
      Number(id)
    );
    logger.info('Salary payhead updated', { id, by: reqUser.email });
    return updated[0];
  }

  static async deletePayhead(reqUser, id) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage salary payheads.', 403);
    }
    const prismaClient = getPrisma();
    await ensurePayheadTable(prismaClient);
    // Soft-delete only. Hard-removing a payhead would orphan the reference in
    // any employee structure built from it.
    await prismaClient.$executeRawUnsafe(
      'UPDATE salary_payheads SET isActive = 0, updatedAt = NOW(3) WHERE id = ?',
      Number(id)
    );
    logger.info('Salary payhead deactivated', { id, by: reqUser.email });
  }

  // ---- Salary rules (the configurable "salary configuration") ----

  static async getSalaryRules(reqUser) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view salary rules.', 403);
    }
    const prismaClient = getPrisma();
    await ensureSalaryRulesTable(prismaClient);
    const rows = await prismaClient.$queryRawUnsafe('SELECT * FROM salary_rules WHERE id = 1 LIMIT 1');
    return readSalaryRulesRow(rows && rows[0]);
  }

  static async updateSalaryRules(reqUser, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update salary rules.', 403);
    }
    const prismaClient = getPrisma();
    await ensureSalaryRulesTable(prismaClient);
    const current = readSalaryRulesRow(
      (await prismaClient.$queryRawUnsafe('SELECT * FROM salary_rules WHERE id = 1 LIMIT 1'))[0]
    );
    const next = { ...current };
    for (const key of [
      'basicPct', 'hraPctOfBasic', 'pfPct', 'pfCap',
      'esicEmployerPct', 'esicEmployeePct', 'esicWageCeiling',
      'professionTax', 'workingDaysMonth', 'notes',
    ]) {
      if (data[key] !== undefined) next[key] = data[key];
    }
    await prismaClient.$executeRawUnsafe(
      `UPDATE salary_rules SET
         basicPct = ?, hraPctOfBasic = ?, pfPct = ?, pfCap = ?,
         esicEmployerPct = ?, esicEmployeePct = ?, esicWageCeiling = ?,
         professionTax = ?, workingDaysMonth = ?, notes = ?, updatedAt = NOW(3)
       WHERE id = 1`,
      next.basicPct, next.hraPctOfBasic, next.pfPct, next.pfCap,
      next.esicEmployerPct, next.esicEmployeePct, next.esicWageCeiling,
      next.professionTax, next.workingDaysMonth, next.notes
    );
    logger.info('Salary rules updated', { by: reqUser.email });
    return this.getSalaryRules(reqUser);
  }

  /** Preview split for a CTC using the current rules — the same engine the
      structure-creation flow uses when HR accepts the standard split. */
  static async previewSalarySplit(reqUser, ctc) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to preview salary splits.', 403);
    }
    const prismaClient = getPrisma();
    await ensureSalaryRulesTable(prismaClient);
    const row = await prismaClient.$queryRawUnsafe('SELECT * FROM salary_rules WHERE id = 1 LIMIT 1');
    return standardSalarySplit(ctc, readSalaryRulesRow(row[0]));
  }

  static async getEmployeeProfileId(userId) {
    const profile = await getPrisma().employeeProfile.findUnique({
      where: { userId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    return profile;
  }

  // ---- Salary Structure ----

  static async createSalaryStructure(reqUser, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage salary structures.', 403);
    }

    const { employeeId, monthlyCTC, currency, isActive, effectiveFrom, effectiveTo, components } = data;

    const employee = await getPrisma().employeeProfile.findUnique({
      where: { employeeId },
    });

    if (!employee) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const existing = await getPrisma().salaryStructure.findUnique({
      where: { employeeId },
    });

    if (existing) {
      throw new AppError(PayrollErrorCodes.SALARY_STRUCTURE_EXISTS, 'A salary structure already exists for this employee.', 409);
    }

    const prismaClient = getPrisma();
    const ruleRows = await prismaClient.$queryRawUnsafe('SELECT * FROM salary_rules WHERE id = 1 LIMIT 1').catch(() => []);
    const rules = readSalaryRulesRow(ruleRows[0]);

    // When HR does not supply explicit components, auto-generate the standard
    // split (Basic / HRA / Special + PF / ESI / PT) from the configured rules
    // — this is the salary-register behaviour the HR team expects.
    let structureComponents = components || [];
    if (structureComponents.length === 0) {
      const split = standardSalarySplit(monthlyCTC, rules);
      structureComponents = [
        ...split.earnings,
        ...split.deductions,
      ].map((c, i) => ({
        name: c.name,
        description: c.code ? `Auto-split · ${c.code}` : null,
        type: c.type,
        calculationType: 'FIXED',
        amount: c.amount,
        sortOrder: i,
        isActive: true,
      }));
    }

    const structure = await prismaClient.salaryStructure.create({
      data: {
        employeeId,
        monthlyCTC,
        currency: currency || 'INR',
        isActive: isActive !== undefined ? isActive : true,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        components: {
          create: structureComponents.map((c) => ({
            name: c.name,
            description: c.description || null,
            type: c.type,
            calculationType: c.calculationType || 'FIXED',
            amount: c.amount || null,
            percentage: c.percentage || null,
            formula: c.formula || null,
            sortOrder: c.sortOrder || 0,
            isActive: c.isActive !== undefined ? c.isActive : true,
          })),
        },
      },
      include: {
        components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    logger.info(`Salary structure created for employee ${employee.employeeCode} by ${reqUser.email}`);

    return {
      id: structure.id,
      employeeId: structure.employeeId,
      monthlyCTC: structure.monthlyCTC,
      currency: structure.currency,
      isActive: structure.isActive,
      effectiveFrom: structure.effectiveFrom,
      effectiveTo: structure.effectiveTo,
      createdAt: structure.createdAt,
      components: structure.components,
    };
  }

  static async updateSalaryStructure(reqUser, structureId, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage salary structures.', 403);
    }

    const existing = await getPrisma().salaryStructure.findUnique({
      where: { id: Number(structureId) },
    });

    if (!existing) {
      throw new AppError(PayrollErrorCodes.SALARY_STRUCTURE_NOT_FOUND, 'Salary structure not found.', 404);
    }

    const updateData = {};
    if (data.monthlyCTC !== undefined) updateData.monthlyCTC = data.monthlyCTC;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.effectiveFrom !== undefined) updateData.effectiveFrom = new Date(data.effectiveFrom);
    if (data.effectiveTo !== undefined) updateData.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;

    const structure = await getPrisma().salaryStructure.update({
      where: { id: parseInt(structureId, 10) },
      data: updateData,
      include: {
        components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    logger.info(`Salary structure ${structureId} updated by ${reqUser.email}`);

    return {
      id: structure.id,
      employeeId: structure.employeeId,
      monthlyCTC: structure.monthlyCTC,
      currency: structure.currency,
      isActive: structure.isActive,
      effectiveFrom: structure.effectiveFrom,
      effectiveTo: structure.effectiveTo,
      createdAt: structure.createdAt,
      components: structure.components,
    };
  }

  static async getSalaryStructure(reqUser, employeeId) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view salary structures.', 403);
    }

    const structure = await getPrisma().salaryStructure.findUnique({
      where: { employeeId },
      include: {
        components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!structure) {
      throw new AppError(PayrollErrorCodes.SALARY_STRUCTURE_NOT_FOUND, 'Salary structure not found for this employee.', 404);
    }

    return {
      id: structure.id,
      employeeId: structure.employeeId,
      monthlyCTC: structure.monthlyCTC,
      currency: structure.currency,
      isActive: structure.isActive,
      effectiveFrom: structure.effectiveFrom,
      effectiveTo: structure.effectiveTo,
      createdAt: structure.createdAt,
      components: structure.components,
    };
  }

  static async listSalaryStructures(reqUser, { page = 1, departmentId = '', search = '' }) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view salary structures.', 403);
    }

    const prismaClient = getPrisma();
    const skip = (page - 1) * PAGE_SIZE;

    let employeeWhere = {};
    if (departmentId) {
      employeeWhere.departmentId = departmentId;
    }
    if (search) {
      employeeWhere.OR = [
        { employeeCode: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }

    // Resolve matching employee IDs first (no @relation on SalaryStructure)
    let matchingEmployeeIds;
    if (Object.keys(employeeWhere).length > 0) {
      const employees = await prismaClient.employeeProfile.findMany({
        where: employeeWhere,
        select: { id: true },
      });
      matchingEmployeeIds = employees.map((e) => e.id);
      if (matchingEmployeeIds.length === 0) {
        return {
          structures: [],
          pagination: { page: 1, pages: 1, total: 0 },
        };
      }
    }

    const structureWhere = { isActive: true };
    if (matchingEmployeeIds) {
      structureWhere.employeeId = { in: matchingEmployeeIds };
    }

    const [structures, total] = await Promise.all([
      prismaClient.salaryStructure.findMany({
        where: structureWhere,
        include: {
          components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
        skip,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
      }),
      prismaClient.salaryStructure.count({ where: structureWhere }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      structures: structures.map((s) => ({
        id: s.id,
        employeeId: s.employeeId,
        monthlyCTC: s.monthlyCTC,
        currency: s.currency,
        isActive: s.isActive,
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo,
        createdAt: s.createdAt,
        components: s.components,
      })),
      pagination: { page, pages, total },
    };
  }

  // ---- Payroll Records ----

  static async createPayroll(reqUser, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create payroll.', 403);
    }

    const { employeeId, month, year } = data;

    if (!this.isValidMonthYear(month, year)) {
      throw new AppError(PayrollErrorCodes.INVALID_PERIOD, 'Invalid month or year.', 400);
    }

    const prismaClient = getPrisma();

    const salaryStructure = await prismaClient.salaryStructure.findUnique({
      where: { employeeId },
      include: {
        components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!salaryStructure) {
      throw new AppError(PayrollErrorCodes.SALARY_STRUCTURE_NOT_FOUND, 'No salary structure found for this employee.', 404);
    }

    if (!salaryStructure.isActive) {
      throw new AppError(PayrollErrorCodes.SALARY_STRUCTURE_INACTIVE, 'Salary structure is inactive.', 400);
    }

    const existing = await prismaClient.payrollRecord.findFirst({
      where: {
        employeeId,
        month,
        year,
      },
    });

    if (existing) {
      throw new AppError(PayrollErrorCodes.PAYROLL_ALREADY_EXISTS, 'Payroll already exists for this period.', 409);
    }

    const components = await this.computeComponents(prismaClient, salaryStructure, month, year);

    const grossEarnings = components
      .filter((c) => c.type === 'EARNING')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const totalDeductions = components
      .filter((c) => c.type === 'DEDUCTION')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const netPay = grossEarnings - totalDeductions;

    const payroll = await prismaClient.payrollRecord.create({
      data: {
        employeeId,
        salaryStructureId: salaryStructure.id,
        month,
        year,
        status: 'DRAFT',
        grossEarnings,
        totalDeductions,
        netPay,
        preparedBy: reqUser.id,
        components: {
          create: components.map((c) => ({
            salaryComponentId: c.salaryComponentId,
            name: c.name,
            type: c.type,
            amount: c.amount,
            sortOrder: c.sortOrder,
          })),
        },
      },
      include: {
        components: { orderBy: { sortOrder: 'asc' } },
      },
    });

    logger.info(`Payroll created for employee ${employeeId} ${month}/${year} by ${reqUser.email}`);

    return this.formatPayrollRecord(payroll);
  }

  static async updatePayrollComponents(reqUser, payrollId, componentOverrides) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to modify payroll.', 403);
    }

    const prismaClient = getPrisma();

    const payroll = await prismaClient.payrollRecord.findUnique({
      where: { id: parseInt(payrollId, 10) },
      include: { components: true },
    });

    if (!payroll) {
      throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll not found.', 404);
    }

    if (payroll.status === 'APPROVED') {
      throw new AppError(PayrollErrorCodes.PAYROLL_LOCKED, 'Approved payroll cannot be modified.', 409);
    }

    let grossEarnings = 0;
    let totalDeductions = 0;

    for (const override of componentOverrides) {
      const component = payroll.components.find((c) => c.id === override.id);
      if (!component) continue;

      const newAmount = override.amount !== undefined ? override.amount : component.amount;

      await prismaClient.payrollComponent.update({
        where: { id: component.id },
        data: { amount: newAmount },
      });

      if (component.type === 'EARNING') {
        grossEarnings += Number(newAmount);
      } else {
        totalDeductions += Number(newAmount);
      }
    }

    const updated = await prismaClient.payrollRecord.update({
      where: { id: parseInt(payrollId, 10) },
      data: { grossEarnings, totalDeductions, netPay: grossEarnings - totalDeductions },
      include: { components: { orderBy: { sortOrder: 'asc' } } },
    });

    return this.formatPayrollRecord(updated);
  }

  static async submitForApproval(reqUser, payrollId) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to submit payroll.', 403);
    }

    const prismaClient = getPrisma();

    const payroll = await prismaClient.payrollRecord.findUnique({
      where: { id: parseInt(payrollId, 10) },
    });

    if (!payroll) {
      throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll not found.', 404);
    }

    if (payroll.status !== 'DRAFT') {
      throw new AppError(PayrollErrorCodes.PAYROLL_APPROVAL_FAILED, 'Only draft payroll can be submitted.', 400);
    }

    const components = await prismaClient.payrollComponent.findMany({
      where: { payrollRecordId: parseInt(payrollId, 10) },
    });

    if (components.length === 0) {
      throw new AppError(PayrollErrorCodes.PAYROLL_NO_COMPONENTS, 'Payroll has no components.', 400);
    }

    const updated = await prismaClient.payrollRecord.update({
      where: { id: parseInt(payrollId, 10) },
      data: { status: 'PENDING_APPROVAL', submittedAt: new Date() },
      include: { components: { orderBy: { sortOrder: 'asc' } } },
    });

    logger.info(`Payroll ${payrollId} submitted for approval by ${reqUser.email}`);

    return this.formatPayrollRecord(updated);
  }

  static async approvePayroll(reqUser, payrollId, comment) {
    if (reqUser.role !== Role.SUPER_ADMIN) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only Super Admin can approve payroll.', 403);
    }

    const prismaClient = getPrisma();

    const payroll = await prismaClient.payrollRecord.findUnique({
      where: { id: parseInt(payrollId, 10) },
    });

    if (!payroll) {
      throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll not found.', 404);
    }

    if (payroll.status !== 'PENDING_APPROVAL') {
      throw new AppError(PayrollErrorCodes.PAYROLL_APPROVAL_FAILED, 'Only pending payroll can be approved.', 400);
    }

    const updated = await prismaClient.payrollRecord.update({
      where: { id: parseInt(payrollId, 10) },
      data: {
        status: 'APPROVED',
        approvedBy: reqUser.id,
        approvedAt: new Date(),
        reviewComment: comment || null,
      },
      include: { components: { orderBy: { sortOrder: 'asc' } } },
    });

    logger.info(`Payroll ${payrollId} approved by ${reqUser.email}`);

    return this.formatPayrollRecord(updated);
  }

  static async rejectPayroll(reqUser, payrollId, reason) {
    if (reqUser.role !== Role.SUPER_ADMIN) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only Super Admin can reject payroll.', 403);
    }

    if (!reason || !reason.trim()) {
      throw new AppError(PayrollErrorCodes.PAYROLL_REJECTION_FAILED, 'A rejection reason is required.', 400);
    }

    const prismaClient = getPrisma();

    const payroll = await prismaClient.payrollRecord.findUnique({
      where: { id: parseInt(payrollId, 10) },
    });

    if (!payroll) {
      throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll not found.', 404);
    }

    if (payroll.status !== 'PENDING_APPROVAL') {
      throw new AppError(PayrollErrorCodes.PAYROLL_REJECTION_FAILED, 'Only pending payroll can be rejected.', 400);
    }

    const updated = await prismaClient.payrollRecord.update({
      where: { id: parseInt(payrollId, 10) },
      data: {
        status: 'REJECTED',
        approvedBy: reqUser.id,
        approvedAt: new Date(),
        rejectionReason: reason.trim(),
      },
      include: { components: { orderBy: { sortOrder: 'asc' } } },
    });

    logger.info(`Payroll ${payrollId} rejected by ${reqUser.email}`);

    return this.formatPayrollRecord(updated);
  }

  static async getPayroll(reqUser, payrollId) {
    const prismaClient = getPrisma();

    const payroll = await prismaClient.payrollRecord.findUnique({
      where: { id: parseInt(payrollId, 10) },
      include: { components: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!payroll) {
      throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll not found.', 404);
    }

    await this.authorizePayrollAccess(reqUser, payroll);

    return this.formatPayrollRecord(payroll);
  }

  static async listPayrolls(reqUser, filters = {}) {
    const prismaClient = getPrisma();
    const {
      page = 1,
      employeeId,
      month,
      year,
      status,
      departmentId,
      search = '',
    } = filters;

    const where = {};

    if (status) {
      where.status = status;
    }
    if (month) {
      where.month = month;
    }
    if (year) {
      where.year = year;
    }

    // Resolve employeeId from search/department filter before querying payrolls
    let resolvedEmployeeIds;
    if (search || departmentId) {
      const employeeWhere = {};
      if (departmentId) {
        employeeWhere.departmentId = departmentId;
      }
      if (search) {
        employeeWhere.OR = [
          { employeeCode: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
        ];
      }
      const matchingEmployees = await prismaClient.employeeProfile.findMany({
        where: employeeWhere,
        select: { id: true },
      });
      resolvedEmployeeIds = matchingEmployees.map((e) => e.id);
      if (resolvedEmployeeIds.length === 0) {
        return { payrolls: [], pagination: { page: 1, pages: 1, total: 0 } };
      }
    }

    if (employeeId) {
      where.employeeId = employeeId;
    } else if (resolvedEmployeeIds) {
      where.employeeId = { in: resolvedEmployeeIds };
    }

    // Employees filter by role
    if (reqUser.role === Role.EMPLOYEE) {
      const profile = await this.getEmployeeProfileId(reqUser.id);
      if (!profile) {
        return { payrolls: [], pagination: { page: 1, pages: 1, total: 0 } };
      }
      where.employeeId = profile.id;
    }

    const skip = (page - 1) * PAGE_SIZE;

    const [payrolls, total] = await Promise.all([
      prismaClient.payrollRecord.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        include: { components: { orderBy: { sortOrder: 'asc' } } },
      }),
      prismaClient.payrollRecord.count({ where }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      payrolls: payrolls.map((p) => this.formatPayrollRecord(p)),
      pagination: { page, pages, total },
    };
  }

  // ---- Payslips ----

  static async generatePayslip(reqUser, payrollId) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to generate payslips.', 403);
    }

    const prismaClient = getPrisma();

    const payroll = await prismaClient.payrollRecord.findUnique({
      where: { id: parseInt(payrollId, 10) },
    });

    if (!payroll) {
      throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll not found.', 404);
    }

    if (payroll.status !== 'APPROVED') {
      throw new AppError(PayrollErrorCodes.PAYROLL_NOT_APPROVED, 'Only approved payroll can have a payslip generated.', 400);
    }

    const existingPayslip = await prismaClient.payslip.findUnique({
      where: { payrollRecordId: parseInt(payrollId, 10) },
    });

    if (existingPayslip) {
      throw new AppError(PayrollErrorCodes.PAYSLIP_ALREADY_EXISTS, 'Payslip already exists for this payroll.', 409);
    }

    const payslip = await prismaClient.payslip.create({
      data: {
        payrollRecordId: payrollId,
        employeeId: payroll.employeeId,
        month: payroll.month,
        year: payroll.year,
        pdfPath: null,
        generatedBy: reqUser.id,
      },
    });

    logger.info(`Payslip generated for payroll ${payrollId} by ${reqUser.email}`);

    return {
      id: payslip.id,
      payrollRecordId: payslip.payrollRecordId,
      employeeId: payslip.employeeId,
      month: payslip.month,
      year: payslip.year,
      generatedBy: payslip.generatedBy,
      generatedAt: payslip.generatedAt,
    };
  }

  static async getPayslip(reqUser, payslipId) {
    const prismaClient = getPrisma();

    const payslip = await prismaClient.payslip.findUnique({
      where: { id: parseInt(payslipId, 10) },
      include: {
        payrollRecord: {
          include: { components: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!payslip) {
      throw new AppError(PayrollErrorCodes.PAYSLIP_NOT_FOUND, 'Payslip not found.', 404);
    }

    await this.authorizePayrollAccess(reqUser, payslip.payrollRecord);

    return this.formatPayslip(payslip);
  }

  static async getMyPayslip(reqUser, month, year) {
    const profile = await this.getEmployeeProfileId(reqUser.id);
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const prismaClient = getPrisma();

    const payslip = await prismaClient.payslip.findFirst({
      where: { employeeId: profile.id, month, year },
      include: {
        payrollRecord: {
          include: { components: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!payslip) {
      throw new AppError(PayrollErrorCodes.PAYSLIP_NOT_FOUND, 'Payslip not found for this period.', 404);
    }

    return this.formatPayslip(payslip);
  }

  static async listMyPayslips(reqUser) {
    const profile = await this.getEmployeeProfileId(reqUser.id);
    if (!profile) {
      return { payslips: [] };
    }

    const prismaClient = getPrisma();

    const payslips = await prismaClient.payslip.findMany({
      where: { employeeId: profile.id },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        payrollRecord: {
          select: {
            status: true,
            grossEarnings: true,
            totalDeductions: true,
            netPay: true,
            components: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    return {
      payslips: payslips.map((p) => this.formatPayslip(p)),
    };
  }

  // ---- PDF Payslip Generation ----

  static async getPayslipPDF(reqUser, payslipId) {
    const prismaClient = getPrisma();

    // Load payslip with its payroll record and components
    const payslip = await prismaClient.payslip.findUnique({
      where: { id: parseInt(payslipId, 10) },
      include: {
        payrollRecord: {
          include: { components: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!payslip) {
      throw new AppError(PayrollErrorCodes.PAYSLIP_NOT_FOUND, 'Payslip not found.', 404);
    }

    const payroll = payslip.payrollRecord;

    // Only approved payrolls produce downloadable payslips
    if (payroll.status !== 'APPROVED') {
      throw new AppError(
        PayrollErrorCodes.PAYROLL_NOT_APPROVED,
        'Payslip is not available for download. Only approved payroll records can be downloaded.',
        400
      );
    }

    // The current month's payroll is still in progress: employees cannot
    // download it yet (the completed months — last 6 at least — remain
    // available). HR keeps full download access for reconciliation.
    if (reqUser.role === Role.EMPLOYEE) {
      const now = new Date();
      if (Number(payroll.month) === now.getMonth() + 1 && Number(payroll.year) === now.getFullYear()) {
        throw new AppError(
          PayrollErrorCodes.INVALID_PERIOD,
          "The current month's payslip is not available yet. Completed months (at least the last 6) remain downloadable.",
          400
        );
      }
    }

    // Reuse existing authorization (covers all four roles)
    await this.authorizePayrollAccess(reqUser, payroll);

    // Load employee profile for display fields
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { id: payroll.employeeId },
      include: {
        department: { select: { name: true } },
        designation: { select: { name: true } },
      },
    });

    // Build component arrays (do NOT recalculate — use stored snapshot)
    const earnings = payroll.components
      .filter((c) => c.type === 'EARNING')
      .map((c) => ({
        name: c.name,
        amount: Number(c.amount),
      }));

    const deductions = payroll.components
      .filter((c) => c.type === 'DEDUCTION')
      .map((c) => ({
        name: c.name,
        amount: Number(c.amount),
      }));

    // Reference-only employer contributions (not deducted from net pay).
    // Mirror the employee deduction where the codes match.
    const employerContributions = [];
    const pfEmp = deductions.find((d) => /PF|PROVIDENT/i.test(d.name));
    if (pfEmp) {
      employerContributions.push({ name: 'Provident Fund (Employer)', amount: pfEmp.amount });
    }
    const esiEmp = deductions.find((d) => /ESI|ESIC/i.test(d.name));
    if (esiEmp) {
      // 0.75% employee vs 3.25% employer -> employer ≈ 4.33x the employee share
      employerContributions.push({ name: 'ESI (Employer)', amount: Math.round(Number(esiEmp.amount) * (3.25 / 0.75) * 100) / 100 });
    }

    // The configured PF/ESIC computation notes to print at the foot of the slip.
    const ruleRows = await prismaClient.$queryRawUnsafe('SELECT notes FROM salary_rules WHERE id = 1 LIMIT 1').catch(() => []);
    const rulesNotes = ruleRows[0] ? String(ruleRows[0].notes || '') : '';

    // Date of joining from the legacy employees table via the profile's userId.
    let dateOfJoining = null;
    if (profile?.userId != null) {
      const joinRows = await prismaClient.$queryRawUnsafe(
        'SELECT joiningDate FROM employees WHERE userId = ? LIMIT 1',
        profile.userId
      ).catch(() => []);
      if (joinRows[0]) dateOfJoining = joinRows[0].joiningDate;
    }

    const pdfBuffer = await generatePayslipPDF({
      employeeCode: profile?.employeeCode || '—',
      employeeName: profile
        ? (profile.firstName?.trim() || profile.lastName?.trim())
          ? `${profile.firstName} ${profile.lastName}`.trim()
          : '—'
        : '—',
      department: profile?.department?.name || undefined,
      designation: profile?.designation?.name || undefined,
      month: payroll.month,
      year: payroll.year,
      grossEarnings: payroll.grossEarnings,
      totalDeductions: payroll.totalDeductions,
      netPay: payroll.netPay,
      earnings,
      deductions,
      employerContributions,
      dateOfJoining,
      notes: rulesNotes,
      payslipGeneratedAt: payslip.generatedAt,
    });

    return {
      pdfBuffer,
      filename: getPayslipFilename(profile?.employeeCode, payroll.month, payroll.year),
    };
  }

  // ---- Helpers ----

  // `payrollRecord.employeeId` is the employeeProfile.id (INT), NOT the user.id
  // that arrives on the request. For an EMPLOYEE, resolve their own profile
  // id and compare that, otherwise a valid self-request is rejected with 403.
  static async authorizePayrollAccess(reqUser, payrollRecord) {
    if ([Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      return;
    }
    if (reqUser.role === Role.EMPLOYEE) {
      const profile = await this.getEmployeeProfileId(reqUser.id);
      const profileId = profile ? Number(profile.id) : null;
      if (profileId === null || Number(payrollRecord.employeeId) !== profileId) {
        throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only access your own payroll records.', 403);
      }
      return;
    }
    throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to access payroll records.', 403);
  }

  static isValidMonthYear(month, year) {
    return Number.isInteger(month) && month >= 1 && month <= 12 &&
           Number.isInteger(year) && year >= 2000 && year <= 2100;
  }

  static async computeComponents(prismaClient, salaryStructure, month, year) {
    const components = [];

    for (const sc of salaryStructure.components) {
      let amount = 0;

      switch (sc.calculationType) {
        case 'FIXED':
          amount = Number(sc.amount) || 0;
          break;
        case 'PERCENTAGE_OF_CTC':
          amount = (Number(salaryStructure.monthlyCTC) * (Number(sc.percentage) || 0)) / 100;
          break;
        default:
          amount = Number(sc.amount) || 0;
      }

      components.push({
        salaryComponentId: sc.id,
        name: sc.name,
        type: sc.type,
        amount: Math.round(amount * 100) / 100,
        sortOrder: sc.sortOrder,
      });
    }

    return components;
  }

  static formatPayrollRecord(payroll) {
    return {
      id: payroll.id,
      employeeId: payroll.employeeId,
      salaryStructureId: payroll.salaryStructureId,
      month: payroll.month,
      year: payroll.year,
      status: payroll.status,
      grossEarnings: payroll.grossEarnings,
      totalDeductions: payroll.totalDeductions,
      netPay: payroll.netPay,
      preparedBy: payroll.preparedBy,
      preparedAt: payroll.preparedAt,
      submittedAt: payroll.submittedAt,
      approvedBy: payroll.approvedBy,
      approvedAt: payroll.approvedAt,
      rejectionReason: payroll.rejectionReason,
      createdAt: payroll.createdAt,
      components: payroll.components || [],
    };
  }

  static formatPayslip(payslip) {
    return {
      id: payslip.id,
      payrollRecordId: payslip.payrollRecordId,
      employeeId: payslip.employeeId,
      month: payslip.month,
      year: payslip.year,
      pdfPath: payslip.pdfPath,
      generatedBy: payslip.generatedBy,
      generatedAt: payslip.generatedAt,
      payroll: payslip.payrollRecord ? this.formatPayrollRecord(payslip.payrollRecord) : null,
    };
  }

  // ---- Dashboard Stats ----

  static async getDashboardStats(reqUser) {
    if (!this.canManagePayroll(reqUser)) {
      return null;
    }

    const prismaClient = getPrisma();

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [totalStructures, pendingApproval, approvedThisMonth, totalEmployees] =
      await Promise.all([
        prismaClient.salaryStructure.count({ where: { isActive: true } }),
        prismaClient.payrollRecord.count({ where: { status: 'PENDING_APPROVAL' } }),
        prismaClient.payrollRecord.count({
          where: { status: 'APPROVED', month: currentMonth, year: currentYear },
        }),
        prismaClient.employeeProfile.count({ where: { status: 'ACTIVE' } }),
      ]);

    return {
      totalSalaryStructures: totalStructures,
      pendingApproval,
      approvedThisMonth,
      totalEmployees,
    };
  }

  static async getMyPayrollSummary(reqUser) {
    const profile = await this.getEmployeeProfileId(reqUser.id);
    if (!profile) {
      return null;
    }

    const prismaClient = getPrisma();

    const structure = await prismaClient.salaryStructure.findUnique({
      where: { employeeId: profile.id },
    });

    if (!structure) {
      return null;
    }

    const latestPayroll = await prismaClient.payrollRecord.findFirst({
      where: { employeeId: profile.id, status: 'APPROVED' },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return {
      monthlyCTC: structure.monthlyCTC,
      currency: structure.currency,
      latestPayroll: latestPayroll ? this.formatPayrollRecord(latestPayroll) : null,
    };
  }
}

module.exports = { PayrollService };
