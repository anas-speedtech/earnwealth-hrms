const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { PayrollErrorCodes } = require('../errors/PayrollErrorCodes');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');
const { generatePayslipPDF, getPayslipFilename } = require('../utils/pdfPayslip');
const { PayrollFormulaEngine } = require('./formula-engine');
const { AttendanceService } = require('./attendance.service');

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
    const where = activeOnly ? { isActive: true } : {};
    const rows = await prismaClient.payrollPayhead.findMany({ where, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] });
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
    const dup = await prismaClient.payrollPayhead.findUnique({ where: { code } });
    if (dup) {
      throw new AppError(AppErrorCodes.CONFLICT, `Payhead code "${code}" already exists.`, 409);
    }
    const created = await prismaClient.payrollPayhead.create({
      data: {
        code,
        name,
        type: data.type,
        description: data.description || null,
        isFixedByDefault: Boolean(data.isFixedByDefault),
        sortOrder: Number(data.sortOrder) || 0,
      },
    });
    logger.info('Salary payhead created', { code, by: reqUser.email });
    return { id: String(created.id), code, name, type: data.type, description: data.description || '' };
  }

  static async updatePayhead(reqUser, id, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage salary payheads.', 403);
    }
    const prismaClient = getPrisma();
    const existing = await prismaClient.payrollPayhead.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Salary payhead not found.', 404);
    }
    const update = {};
    if (data.name !== undefined) update.name = String(data.name).trim();
    if (data.description !== undefined) update.description = data.description || null;
    if (data.isFixedByDefault !== undefined) update.isFixedByDefault = Boolean(data.isFixedByDefault);
    if (data.sortOrder !== undefined) update.sortOrder = Number(data.sortOrder) || 0;
    // Type cannot change once in use: employee structures already reference
    // the old value and payroll math would silently re-classify amounts.
    if (data.type !== undefined && ['EARNING', 'DEDUCTION'].includes(data.type)) update.type = data.type;
    if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);
    const updated = await prismaClient.payrollPayhead.update({ where: { id: existing.id }, data: update });
    logger.info('Salary payhead updated', { id, by: reqUser.email });
    return updated;
  }

  static async deletePayhead(reqUser, id) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage salary payheads.', 403);
    }
    const prismaClient = getPrisma();
    // Soft-delete only. Hard-removing a payhead would orphan the reference in
    // any employee structure built from it.
    await prismaClient.payrollPayhead.update({ where: { id: Number(id) }, data: { isActive: false } });
    logger.info('Salary payhead deactivated', { id, by: reqUser.email });
  }

  // ---- Salary rules (the configurable "salary configuration") ----

  // The configured salary split lives in a single salary_rules row. The
  // table is seeded by a Prisma migration; these helpers read/update it
  // through the generated delegate.
  static async getSalaryRulesRow(prismaClient = getPrisma()) {
    return prismaClient.payrollRule.findFirst();
  }

  static async getSalaryRules(reqUser) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view salary rules.', 403);
    }
    const row = await this.getSalaryRulesRow();
    return readSalaryRulesRow(row);
  }

  static async updateSalaryRules(reqUser, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update salary rules.', 403);
    }
    const prismaClient = getPrisma();
    const current = await this.getSalaryRulesRow(prismaClient);
    const next = readSalaryRulesRow(current);
    const update = {};
    for (const key of [
      'basicPct', 'hraPctOfBasic', 'pfPct', 'pfCap',
      'esicEmployerPct', 'esicEmployeePct', 'esicWageCeiling',
      'professionTax', 'workingDaysMonth', 'notes',
    ]) {
      if (data[key] !== undefined) {
        next[key] = data[key];
        update[key] = key === 'notes' ? (data[key] || null) : data[key];
      }
    }
    // The seeded row id is stable (migration inserts id = 1); resolve it so
    // the update is never a blind upsert.
    if (!current) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Salary rules row not found.', 404);
    }
    await prismaClient.payrollRule.update({ where: { id: current.id }, data: update });
    logger.info('Salary rules updated', { by: reqUser.email });
    return this.getSalaryRules(reqUser);
  }

  /** Preview split for a CTC using the current rules — the same engine the
      structure-creation flow uses when HR accepts the standard split. */
  static async previewSalarySplit(reqUser, ctc) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to preview salary splits.', 403);
    }
    const row = await this.getSalaryRulesRow();
    return standardSalarySplit(ctc, readSalaryRulesRow(row));
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

        // employeeId is the employee profile's INT id (the payroll-side key), not
    // a uuid — validate the profile exists before touching its structure.
    const employee = await getPrisma().employeeProfile.findUnique({
      where: { id: Number(employeeId) },
    });

    if (!employee) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const prismaClient = getPrisma();

    // salary_structures now keeps an effective-dated revision chain per
    // employee (the hard employeeId unique key was dropped), so "already
    // exists" means an open structure (active, no end date) is in place.
    const openStructure = await this.findOpenSalaryStructure(prismaClient, employeeId);

    if (openStructure) {
      throw new AppError(PayrollErrorCodes.SALARY_STRUCTURE_EXISTS, 'An active salary structure already exists for this employee.', 409);
    }

    const rules = readSalaryRulesRow(await this.getSalaryRulesRow(prismaClient));

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

    this.validateStructureComponents(structureComponents);

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
            amount: c.amount ?? null,
            percentage: c.percentage ?? null,
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

    const structure = await this.findOpenSalaryStructure(getPrisma(), employeeId, {
      include: { components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
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

    const { employeeId, month, year, applyAttendanceProration = false } = data;

    if (!this.isValidMonthYear(month, year)) {
      throw new AppError(PayrollErrorCodes.INVALID_PERIOD, 'Invalid month or year.', 400);
    }

    const prismaClient = getPrisma();

    const period = await prismaClient.payrollPeriod.findFirst({
      where: { month, year, payrollGroup: null },
    });
    if (period && ['LOCKED', 'PAID'].includes(period.status)) {
      throw new AppError(PayrollErrorCodes.PAYROLL_LOCKED, 'This payroll period is locked and cannot be recalculated.', 409);
    }

    const salaryStructure = await this.findOpenSalaryStructure(prismaClient, employeeId, {
      include: { components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });

    if (!salaryStructure) {
      throw new AppError(PayrollErrorCodes.SALARY_STRUCTURE_NOT_FOUND, 'No salary structure found for this employee.', 404);
    }

    if (!salaryStructure.isActive) {
      throw new AppError(PayrollErrorCodes.SALARY_STRUCTURE_INACTIVE, 'Salary structure is inactive.', 400);
    }

    const payrollProfile = await prismaClient.employeePayrollProfile.findUnique({ where: { employeeId: Number(employeeId) } });
    if (payrollProfile?.salaryOnHold) {
      throw new AppError(PayrollErrorCodes.PAYROLL_LOCKED, payrollProfile.holdReason || 'Salary is on hold for this employee.', 409);
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

    const unproratedComponents = await this.computeComponents(prismaClient, salaryStructure, month, year);
    const attendanceInputs = applyAttendanceProration
      ? await this.getAttendancePayrollInputs(reqUser, employeeId, month, year)
      : null;
    const baseComponents = attendanceInputs ? this.prorateEarnings(unproratedComponents, attendanceInputs) : unproratedComponents;
    const statutory = await this.applyStatutoryComponents(prismaClient, payrollProfile, baseComponents, month, year);
    const adjustments = await this.applyPayrollAdjustments(prismaClient, Number(employeeId), statutory.components, month, year);
    const components = adjustments.components;

    const grossEarnings = components
      .filter((c) => c.type === 'EARNING')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const totalDeductions = components
      .filter((c) => c.type === 'DEDUCTION')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const netPay = grossEarnings - totalDeductions;

    // Immutable snapshots of everything the calculation depended on. Captured
    // once at calculation time and frozen with the record: recomputing a month
    // later must never rewrite what an already-approved record was based on.
    const structureSnapshot = {
      structureId: salaryStructure.id,
      monthlyCTC: salaryStructure.monthlyCTC,
      effectiveFrom: salaryStructure.effectiveFrom,
      components: (salaryStructure.components || []).map((c) => ({
        id: c.id, name: c.name, type: c.type, amount: c.amount, percentage: c.percentage,
        formula: c.formula, calculationType: c.calculationType, payheadCode: c.payheadCode,
        prorateAttendance: c.prorateAttendance, isActive: c.isActive,
      })),
    };
    const statutorySnapshot = {
      settings: statutory.appliedSettings || [],
      components: statutory.components
        .filter((c) => c.type !== 'EARNING' || /PF|ESI|PT|GRATUITY/i.test(c.name || ''))
        .map((c) => ({ name: c.name, type: c.type, amount: c.amount })),
    };
    const profileSnapshot = payrollProfile ? {
      employeeId: payrollProfile.employeeId,
      stateCode: payrollProfile.stateCode,
      taxRegime: payrollProfile.taxRegime,
      pfApplicable: payrollProfile.pfApplicable,
      esiApplicable: payrollProfile.esiApplicable,
      voluntaryPfRate: payrollProfile.voluntaryPfRate,
      salaryOnHold: payrollProfile.salaryOnHold,
      exitDate: payrollProfile.exitDate,
      noticePeriodDays: payrollProfile.noticePeriodDays,
    } : null;
    const adjustmentsSnapshot = {
      applied: adjustments.appliedAdjustments || [],
      attendance: attendanceInputs
        ? { basis: 'WORKING_DAYS', factor: attendanceInputs.prorationFactor, warnings: attendanceInputs.warnings }
        : null,
    };

    const payroll = await prismaClient.payrollRecord.create({
      data: {
        employeeId,
        salaryStructureId: salaryStructure.id,
        periodId: period ? period.id : null,
        month,
        year,
        status: 'DRAFT',
        grossEarnings,
        totalDeductions,
        netPay,
        preparedBy: reqUser.id,
        structureSnapshotJson: JSON.stringify(structureSnapshot),
        statutorySnapshotJson: JSON.stringify(statutorySnapshot),
        profileSnapshotJson: payrollProfile ? JSON.stringify(profileSnapshot) : null,
        adjustmentsJson: JSON.stringify(adjustmentsSnapshot),
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

    if (attendanceInputs) {
      await prismaClient.payrollInputSnapshot.create({ data: {
        payrollRecordId: payroll.id, totalCalendarDays: attendanceInputs.totalCalendarDays,
        workingDays: attendanceInputs.workingDays, presentDays: attendanceInputs.presentDays,
        paidLeaveDays: attendanceInputs.paidLeaveDays, unpaidLeaveDays: attendanceInputs.unpaidLeaveDays,
        lopDays: attendanceInputs.lopDays, halfDays: attendanceInputs.halfDays, prorationBasis: 'WORKING_DAYS',
        prorationFactor: attendanceInputs.prorationFactor, warningsJson: JSON.stringify(attendanceInputs.warnings),
      } });
    }

    logger.info(`Payroll created for employee ${employeeId} ${month}/${year} by ${reqUser.email}`);

    await this.writePayrollAudit(prismaClient, {
      payrollRecordId: payroll.id, actorId: reqUser.id, action: 'PAYROLL_CALCULATED',
      afterValue: { attendance: attendanceInputs, statutorySettings: statutory.appliedSettings, adjustments: adjustments.appliedAdjustments, grossEarnings, totalDeductions, netPay },
    });

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

    this.assertPayrollRecordMutable(payroll, 'modify');

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

    await this.settleApprovedPayrollAdjustments(prismaClient, updated, reqUser.id);

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

  // ---- Record-level lock / unlock / paid (checklist: make calculations immutable) ----

  // A record may only be modified while it is still in a pre-approval state.
  // APPROVED records are frozen; LOCKED/PAID records are frozen and require an
  // authorized unlock (at the period level) before any correction.
  static assertPayrollRecordMutable(payroll, action) {
    if (['LOCKED', 'PAID'].includes(payroll.status)) {
      throw new AppError(PayrollErrorCodes.PAYROLL_LOCKED,
        `This payroll is ${payroll.status.toLowerCase()} and immutable. Unlock the payroll period and create a correction record to ${action}.`, 409);
    }
    if (payroll.status === 'APPROVED') {
      throw new AppError(PayrollErrorCodes.PAYROLL_LOCKED, 'Approved payroll cannot be modified.', 409);
    }
  }

  // Freeze a single record at APPROVED: its component values and the
  // structure/statutory/profile/adjustment snapshots captured at calculation
  // time become the immutable source of record.
  static async lockPayroll(reqUser, payrollId) {
    if (reqUser.role !== Role.SUPER_ADMIN) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only Super Admin can lock a payroll record.', 403);
    }
    const prismaClient = getPrisma();
    const payroll = await prismaClient.payrollRecord.findUnique({ where: { id: Number(payrollId) } });
    if (!payroll) throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll record not found.', 404);
    if (payroll.status !== 'APPROVED') {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Only approved payroll records can be locked.', 409);
    }
    if (payroll.lockedAt) throw new AppError(PayrollErrorCodes.PAYROLL_LOCKED, 'Payroll record is already locked.', 409);
    const now = new Date();
    const updated = await prismaClient.payrollRecord.update({
      where: { id: payroll.id },
      data: { lockedAt: now, lockedBy: Number(reqUser.id) },
    });
    await this.writePayrollAudit(prismaClient, {
      payrollRecordId: payroll.id, actorId: reqUser.id,
      action: 'PAYROLL_LOCKED', beforeValue: payroll, afterValue: updated,
    });
    return this.formatPayrollRecord(updated);
  }

  // Authorized unlock of a LOCKED record, back to APPROVED, with a mandatory
  // reason. This is the only path that reopens a frozen record; the audit log
  // records the actor, timestamp, and before/after values.
  static async unlockPayroll(reqUser, payrollId, reason) {
    if (reqUser.role !== Role.SUPER_ADMIN) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only Super Admin can unlock a payroll record.', 403);
    }
    if (!reason || !reason.trim()) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'A correction reason is required to unlock a locked payroll record.', 400);
    }
    const prismaClient = getPrisma();
    const payroll = await prismaClient.payrollRecord.findUnique({ where: { id: Number(payrollId) } });
    if (!payroll) throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll record not found.', 404);
    if (payroll.status !== 'APPROVED' || !payroll.lockedAt) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Only a locked, approved payroll record can be unlocked.', 409);
    }
    const updated = await prismaClient.payrollRecord.update({
      where: { id: payroll.id },
      data: { lockedAt: null, lockedBy: null },
    });
    await this.writePayrollAudit(prismaClient, {
      payrollRecordId: payroll.id, actorId: reqUser.id,
      action: 'PAYROLL_UNLOCKED', reason: reason.trim(),
      beforeValue: { lockedAt: payroll.lockedAt, lockedBy: payroll.lockedBy }, afterValue: updated,
    });
    return this.formatPayrollRecord(updated);
  }

  // Mark a locked record as paid. Loans/advances/reimbursements are settled
  // exactly once at approval; PAID only records the disbursement moment.
  static async markPayrollPaid(reqUser, payrollId) {
    if (reqUser.role !== Role.SUPER_ADMIN) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only Super Admin can mark a payroll record as paid.', 403);
    }
    const prismaClient = getPrisma();
    const payroll = await prismaClient.payrollRecord.findUnique({ where: { id: Number(payrollId) } });
    if (!payroll) throw new AppError(PayrollErrorCodes.PAYROLL_NOT_FOUND, 'Payroll record not found.', 404);
    if (payroll.status !== 'APPROVED' || !payroll.lockedAt) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Only a locked, approved payroll record can be marked paid.', 409);
    }
    if (payroll.paidAt) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Payroll record is already marked paid.', 409);
    const updated = await prismaClient.payrollRecord.update({
      where: { id: payroll.id },
      data: { paidAt: new Date() },
    });
    await this.writePayrollAudit(prismaClient, {
      payrollRecordId: payroll.id, actorId: reqUser.id,
      action: 'PAYROLL_PAID', beforeValue: payroll, afterValue: updated,
    });
    return this.formatPayrollRecord(updated);
  }

  // ---- One-time adjustments (bonuses, incentives, arrears, advances) ----

  static async listOneTimeAdjustments(reqUser, { employeeId, status } = {}) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view payroll adjustments.', 403);
    }
    const where = {};
    if (employeeId) where.employeeId = Number(employeeId);
    if (status === 'APPLIED') where.payrollRecordId = { not: null };
    if (status === 'PENDING') where.payrollRecordId = null;
    return getPrisma().payrollOneTimeAdjustment.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  static async createOneTimeAdjustment(reqUser, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create payroll adjustments.', 403);
    }
    const employeeId = Number(data.employeeId);
    if (!employeeId) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'employeeId is required.', 400);
    const type = String(data.type || '').toUpperCase();
    const allowedTypes = ['ONE_TIME_EARNING', 'ONE_TIME_DEDUCTION', 'BONUS', 'INCENTIVE', 'ARREARS', 'SALARY_ADVANCE'];
    if (!allowedTypes.includes(type)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, `type must be one of: ${allowedTypes.join(', ')}.`, 400);
    }
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'amount must be a positive number.', 400);
    }
    const prismaClient = getPrisma();
    const employee = await prismaClient.employeeProfile.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    const created = await prismaClient.payrollOneTimeAdjustment.create({
      data: {
        employeeId,
        type,
        amount,
        reason: data.reason ? String(data.reason).slice(0, 500) : null,
        approvedBy: Number(reqUser.id),
      },
    });
    await this.writePayrollAudit(prismaClient, { actorId: reqUser.id, action: 'ONE_TIME_ADJUSTMENT_CREATED', afterValue: created });
    return created;
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

    // Load employee profile for display fields. Department/designation are
    // scalar foreign keys on EmployeeProfile (no Prisma relations), so their
    // names are resolved with separate lookups — an invalid `include` on those
    // fields would make the generated client throw and 500 every PDF download.
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { id: payroll.employeeId },
    });
    const departmentRow = profile?.departmentId
      ? await prismaClient.department.findUnique({ where: { id: profile.departmentId } })
      : null;
    const designationRow = profile?.designationId
      ? await prismaClient.designation.findUnique({ where: { id: profile.designationId } })
      : null;

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
    const ruleRow = await prismaClient.payrollRule.findFirst({ select: { notes: true } }).catch(() => null);
    const rulesNotes = ruleRow ? String(ruleRow.notes || '') : '';

    // Date of joining from the legacy employees table via the profile's userId.
    let dateOfJoining = null;
    if (profile?.userId != null) {
      const legacyEmployee = await prismaClient.employee.findUnique({
        where: { userId: profile.userId },
        select: { joiningDate: true },
      }).catch(() => null);
      if (legacyEmployee) dateOfJoining = legacyEmployee.joiningDate;
    }

    const pdfBuffer = await generatePayslipPDF({
      employeeCode: profile?.employeeCode || '—',
      employeeName: profile
        ? (profile.firstName?.trim() || profile.lastName?.trim())
          ? `${profile.firstName} ${profile.lastName}`.trim()
          : '—'
        : '—',
      department: departmentRow?.name || undefined,
      designation: designationRow?.name || undefined,
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

  // ---- Payroll period lifecycle ----

  static async getOrCreatePayrollPeriod(reqUser, { month, year, payrollGroup = null }) {
    if (!this.canManagePayroll(reqUser) || !this.isValidMonthYear(month, year)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage this payroll period.', 403);
    }
    const prismaClient = getPrisma();
    let period = await prismaClient.payrollPeriod.findFirst({ where: { month, year, payrollGroup } });
    if (!period) {
      period = await prismaClient.payrollPeriod.create({ data: { month, year, payrollGroup, createdBy: Number(reqUser.id) } });
      await this.writePayrollAudit(prismaClient, { payrollPeriodId: period.id, actorId: reqUser.id, action: 'PERIOD_CREATED', afterValue: period });
    }
    return period;
  }

  // Period status state machine. Multi-step: HR calculates -> HR reviews ->
  // Finance reviews -> the approver approves -> locks -> marks paid. A locked
  // period may only be reopened through an authorized unlock that records the
  // reason and actor.
  static get PERIOD_TRANSITIONS() {
    return {
      DRAFT: ['CALCULATED'],
      CALCULATED: ['UNDER_REVIEW'],
      UNDER_REVIEW: ['PENDING_APPROVAL', 'CALCULATED'],
      PENDING_APPROVAL: ['APPROVED', 'UNDER_REVIEW'],
      APPROVED: ['LOCKED'],
      LOCKED: ['PAID', 'APPROVED'], // PAID finalizes; APPROVED = authorized unlock
      PAID: [],
    };
  }

  static async transitionPayrollPeriod(reqUser, periodId, status, reason = '') {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage payroll periods.', 403);
    }
    const prismaClient = getPrisma();
    const previous = await prismaClient.payrollPeriod.findUnique({ where: { id: Number(periodId) } });
    if (!previous) throw new AppError(AppErrorCodes.NOT_FOUND, 'Payroll period not found.', 404);

    // An authorized unlock: LOCKED -> APPROVED requires a recorded reason.
    const isUnlock = previous.status === 'LOCKED' && status === 'APPROVED';
    if (isUnlock && !reason.trim()) {
      throw new AppError(PayrollErrorCodes.PAYROLL_LOCKED, 'A correction reason is required to unlock a locked payroll period.', 409);
    }
    // Role gates on sensitive forward steps.
    if (['APPROVED', 'LOCKED', 'PAID'].includes(status) && !isUnlock && reqUser.role !== Role.SUPER_ADMIN) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only Super Admin can approve, lock, or mark a payroll period as paid.', 403);
    }
    const allowed = this.PERIOD_TRANSITIONS[previous.status] || [];
    if (!allowed.includes(status)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR,
        `Cannot move a payroll period from ${previous.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}.`, 409);
    }

    const now = new Date();
    const period = await prismaClient.payrollPeriod.update({
      where: { id: previous.id },
      data: {
        status,
        lockedAt: status === 'LOCKED' ? now : null,
        lockedBy: status === 'LOCKED' ? Number(reqUser.id) : null,
        paidAt: status === 'PAID' ? now : null,
        unlockedAt: isUnlock ? now : null,
        unlockedBy: isUnlock ? Number(reqUser.id) : null,
        unlockReason: isUnlock ? reason.trim() : null,
      },
    });
    await this.writePayrollAudit(prismaClient, {
      payrollPeriodId: period.id, actorId: reqUser.id,
      action: isUnlock ? 'PERIOD_UNLOCKED' : `PERIOD_${status}`, reason: reason || null,
      beforeValue: previous, afterValue: period,
    });
    return period;
  }

  // Explicit review gates that sit on the period record so the approval
  // trail answers "who reviewed this, and when" without mining audit logs.
  static async recordPayrollPeriodReview(reqUser, periodId, gate) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review payroll periods.', 403);
    }
    if (!['HR_REVIEW', 'FINANCE_REVIEW'].includes(gate)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Review gate must be HR_REVIEW or FINANCE_REVIEW.', 400);
    }
    const prismaClient = getPrisma();
    const previous = await prismaClient.payrollPeriod.findUnique({ where: { id: Number(periodId) } });
    if (!previous) throw new AppError(AppErrorCodes.NOT_FOUND, 'Payroll period not found.', 404);
    if (['LOCKED', 'PAID'].includes(previous.status)) {
      throw new AppError(PayrollErrorCodes.PAYROLL_LOCKED, 'A locked payroll period cannot be reviewed; unlock it first.', 409);
    }
    const now = new Date();
    const data = gate === 'HR_REVIEW'
      ? { hrReviewedAt: now, hrReviewedBy: Number(reqUser.id) }
      : { financeReviewedAt: now, financeReviewedBy: Number(reqUser.id) };
    const period = await prismaClient.payrollPeriod.update({ where: { id: previous.id }, data });
    await this.writePayrollAudit(prismaClient, {
      payrollPeriodId: period.id, actorId: reqUser.id,
      action: `PERIOD_${gate}_RECORDED`, beforeValue: previous, afterValue: period,
    });
    return period;
  }

  // ---- Effective-dated statutory configuration ----

  static async listStatutorySettings(reqUser, { statutoryType, stateCode, asOf } = {}) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view statutory settings.', 403);
    }
    const date = asOf ? new Date(asOf) : new Date();
    const where = { isActive: true };
    if (statutoryType) where.statutoryType = statutoryType;
    if (stateCode) where.stateCode = stateCode.toUpperCase();
    if (asOf) where.AND = [{ effectiveFrom: { lte: date } }, { OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }];
    return getPrisma().payrollStatutorySetting.findMany({ where, orderBy: [{ statutoryType: 'asc' }, { stateCode: 'asc' }, { effectiveFrom: 'desc' }] });
  }

  static async createStatutorySetting(reqUser, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage statutory settings.', 403);
    }
    const statutoryType = String(data.statutoryType || '').trim().toUpperCase();
    if (!['EPF', 'EPS', 'EDLI', 'PF_ADMIN', 'ESI', 'PT', 'LWF', 'TDS', 'GRATUITY', 'BONUS'].includes(statutoryType)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unsupported statutory setting type.', 400);
    }
    const from = new Date(data.effectiveFrom);
    const to = data.effectiveTo ? new Date(data.effectiveTo) : null;
    if (Number.isNaN(from.getTime()) || (to && (Number.isNaN(to.getTime()) || to < from))) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Provide a valid effective date range.', 400);
    }
    const prismaClient = getPrisma();
    const created = await prismaClient.payrollStatutorySetting.create({ data: {
      statutoryType, stateCode: data.stateCode ? String(data.stateCode).toUpperCase() : null,
      employeeRate: Number(data.employeeRate || 0), employerRate: Number(data.employerRate || 0),
      wageBasis: data.wageBasis || 'GROSS', wageCeiling: data.wageCeiling == null ? null : Number(data.wageCeiling),
      eligibilityJson: data.eligibility ? JSON.stringify(data.eligibility) : null,
      configurationJson: data.configuration ? JSON.stringify(data.configuration) : null,
      effectiveFrom: from, effectiveTo: to, isActive: data.isActive !== false, createdBy: Number(reqUser.id),
    } });
    await this.writePayrollAudit(prismaClient, { actorId: reqUser.id, action: 'STATUTORY_SETTING_CREATED', afterValue: created });
    return created;
  }

  static async updateStatutorySetting(reqUser, id, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage statutory settings.', 403);
    }
    const prismaClient = getPrisma();
    const before = await prismaClient.payrollStatutorySetting.findUnique({ where: { id: Number(id) } });
    if (!before) throw new AppError(AppErrorCodes.NOT_FOUND, 'Statutory setting not found.', 404);
    const update = {};
    for (const key of ['employeeRate', 'employerRate', 'wageBasis', 'wageCeiling', 'isActive']) if (data[key] !== undefined) update[key] = data[key];
    if (data.stateCode !== undefined) update.stateCode = data.stateCode ? String(data.stateCode).toUpperCase() : null;
    if (data.effectiveFrom !== undefined) update.effectiveFrom = new Date(data.effectiveFrom);
    if (data.effectiveTo !== undefined) update.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;
    if (data.eligibility !== undefined) update.eligibilityJson = data.eligibility ? JSON.stringify(data.eligibility) : null;
    if (data.configuration !== undefined) update.configurationJson = data.configuration ? JSON.stringify(data.configuration) : null;
    const updated = await prismaClient.payrollStatutorySetting.update({ where: { id: before.id }, data: update });
    await this.writePayrollAudit(prismaClient, { actorId: reqUser.id, action: 'STATUTORY_SETTING_UPDATED', beforeValue: before, afterValue: updated });
    return updated;
  }

  // ---- Employee payroll profile (sensitive data is server-authorized) ----

  static async getEmployeePayrollProfile(reqUser, employeeId) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view payroll profiles.', 403);
    }
    const prismaClient = getPrisma();
    const employee = await prismaClient.employeeProfile.findUnique({ where: { id: Number(employeeId) }, select: { id: true } });
    if (!employee) throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    return prismaClient.employeePayrollProfile.findUnique({ where: { employeeId: employee.id } });
  }

  static async upsertEmployeePayrollProfile(reqUser, employeeId, data) {
    if (!this.canManagePayroll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage payroll profiles.', 403);
    }
    const prismaClient = getPrisma();
    const id = Number(employeeId);
    const employee = await prismaClient.employeeProfile.findUnique({ where: { id }, select: { id: true } });
    if (!employee) throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    const profileData = {};
    for (const key of ['pan', 'uan', 'bankName', 'bankAccountMasked', 'bankIfsc', 'taxRegime', 'pfApplicable', 'esiApplicable', 'voluntaryPfRate', 'salaryOnHold', 'holdReason', 'stateCode']) {
      if (data[key] !== undefined) profileData[key] = data[key] === '' ? null : data[key];
    }
    // Exiter context: date/number fields validated and normalized explicitly.
    if (data.exitDate !== undefined) {
      profileData.exitDate = data.exitDate ? new Date(data.exitDate) : null;
      if (data.exitDate && Number.isNaN(profileData.exitDate.getTime())) {
        throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'exitDate is not a valid date.', 400);
      }
    }
    if (data.noticePeriodDays !== undefined) {
      profileData.noticePeriodDays = Math.max(0, Number(data.noticePeriodDays) || 0);
    }
    if (profileData.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(String(profileData.pan))) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'PAN must use the standard 10-character format.', 400);
    }
    if (profileData.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(String(profileData.bankIfsc))) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'IFSC code format is invalid.', 400);
    }
    const before = await prismaClient.employeePayrollProfile.findUnique({ where: { employeeId: id } });
    const updated = await prismaClient.employeePayrollProfile.upsert({
      where: { employeeId: id }, create: { employeeId: id, ...profileData }, update: profileData,
    });
    await this.writePayrollAudit(prismaClient, { actorId: reqUser.id, action: 'EMPLOYEE_PAYROLL_PROFILE_UPDATED', beforeValue: before, afterValue: updated });
    return updated;
  }

  static async getAttendancePayrollInputs(reqUser, employeeProfileId, month, year) {
    if (!this.canManagePayroll(reqUser) || !this.isValidMonthYear(Number(month), Number(year))) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'A valid employee and payroll period are required.', 400);
    }
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({ where: { id: Number(employeeProfileId) }, select: { userId: true } });
    if (!profile) throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    const legacyEmployee = await prismaClient.employee.findUnique({ where: { userId: profile.userId }, select: { id: true } });
    if (!legacyEmployee) {
      return { totalCalendarDays: new Date(Number(year), Number(month), 0).getDate(), workingDays: 0, presentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, lopDays: 0, halfDays: 0, prorationFactor: 1, warnings: ['No linked attendance employee record found; salary was not prorated.'] };
    }
    const matrix = await AttendanceService.computeMatrix(prismaClient, { yearNum: Number(year), monthNum: Number(month), employeeId: legacyEmployee.id });
    const days = matrix.rows[0]?.days || [];
    const working = days.filter((day) => !day.isOffDay);
    const present = working.reduce((total, day) => total + (day.status === 'P' ? 1 : day.status === 'H' ? 0.5 : 0), 0);
    // The existing leave module does not yet expose paid/unpaid classification;
    // approved leave is deliberately reported as paid with a warning so HR can
    // correct the input before finalizing payroll.
    const paidLeave = working.filter((day) => day.status === 'L').length;
    const halfDays = working.filter((day) => day.status === 'H').length;
    const lop = Math.max(0, working.length - present - paidLeave);
    const prorationFactor = working.length > 0 ? Math.min(1, Math.max(0, (present + paidLeave) / working.length)) : 1;
    return {
      totalCalendarDays: matrix.daysInMonth, workingDays: working.length, presentDays: present,
      paidLeaveDays: paidLeave, unpaidLeaveDays: 0, lopDays: lop, halfDays,
      prorationFactor,
      warnings: [
        ...(paidLeave ? ['Approved leave is currently treated as paid; review leave classification before finalizing payroll.'] : []),
        ...(working.length > 0 && present === 0 && paidLeave === 0 ? ['No paid attendance was found; verify attendance before approving payroll.'] : []),
      ],
    };
  }

  static prorateEarnings(components, attendanceInputs) {
    const factor = Number(attendanceInputs.prorationFactor);
    if (!Number.isFinite(factor) || factor >= 1) return components;
    return components.map((component) => component.type === 'EARNING'
      ? { ...component, amount: Math.round(Number(component.amount) * factor * 100) / 100 }
      : component);
  }

  static async applyStatutoryComponents(prismaClient, payrollProfile, components, month, year) {
    const asOf = new Date(Date.UTC(year, month - 1, 1));
    const settings = await prismaClient.payrollStatutorySetting.findMany({
      where: { isActive: true, effectiveFrom: { lte: asOf }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] },
      orderBy: { effectiveFrom: 'desc' },
    });
    const settingFor = (type) => settings.find((setting) => setting.statutoryType === type && !setting.stateCode) || null;
    const round = (value) => Math.round(value * 100) / 100;
    const earnings = components.filter((component) => component.type === 'EARNING');
    const basic = Number(earnings.find((component) => /^(basic|basic salary)$/i.test(component.name))?.amount || 0);
    const gross = earnings.reduce((total, component) => total + Number(component.amount), 0);
    const result = components.filter((component) => component.type !== 'MEMO');
    const replace = (name, type, amount) => {
      const index = result.findIndex((component) => component.type === type && component.name === name);
      const component = { salaryComponentId: null, name, type, amount: round(amount), sortOrder: 900 + result.length };
      if (index >= 0) result[index] = { ...result[index], amount: component.amount };
      else result.push(component);
    };
    const appliedSettings = [];

    const pf = settingFor('EPF');
    if (pf && payrollProfile?.pfApplicable !== false) {
      const wage = Math.min(basic, pf.wageCeiling == null ? basic : Number(pf.wageCeiling));
      const employeeRate = Number(payrollProfile?.voluntaryPfRate ?? pf.employeeRate);
      replace('Provident Fund (Employee)', 'DEDUCTION', wage * employeeRate / 100);
      replace('Provident Fund (Employer)', 'MEMO', wage * Number(pf.employerRate) / 100);
      appliedSettings.push({ type: 'EPF', id: pf.id, wage, employeeRate, employerRate: Number(pf.employerRate) });
    }
    const esi = settingFor('ESI');
    if (esi && payrollProfile?.esiApplicable === true && (esi.wageCeiling == null || gross <= Number(esi.wageCeiling))) {
      replace('ESI (Employee)', 'DEDUCTION', gross * Number(esi.employeeRate) / 100);
      replace('ESI (Employer)', 'MEMO', gross * Number(esi.employerRate) / 100);
      appliedSettings.push({ type: 'ESI', id: esi.id, wage: gross, employeeRate: Number(esi.employeeRate), employerRate: Number(esi.employerRate) });
    }
    const pt = settingFor('PT');
    if (pt) {
      const amount = pt.wageCeiling != null && gross < Number(pt.wageCeiling) ? 0 : Number(pt.employeeRate);
      replace('Professional Tax', 'DEDUCTION', amount);
      appliedSettings.push({ type: 'PT', id: pt.id, amount });
    }
    return { components: result, appliedSettings };
  }

  static async applyPayrollAdjustments(prismaClient, employeeId, components, month, year) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const [loans, reimbursements, oneTimeAdjustments] = await Promise.all([
      prismaClient.employeeLoan.findMany({ where: { employeeId, status: 'ACTIVE', startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] } }),
      prismaClient.employeeReimbursement.findMany({ where: { employeeId, status: 'APPROVED', payrollRecordId: null, claimDate: { gte: start, lt: end } } }),
      // One-time earnings/deductions queued for this employee: bonuses,
      // incentives, arrears, correction entries. Consumed by the payroll run
      // and linked back on settlement (payrollRecordId stays null until then).
      prismaClient.payrollOneTimeAdjustment.findMany({ where: { employeeId, payrollRecordId: null }, orderBy: { createdAt: 'asc' } }),
    ]);
    const result = [...components];
    const round = (value) => Math.round(value * 100) / 100;
    const add = (name, type, amount) => result.push({ salaryComponentId: null, name, type, amount: round(amount), sortOrder: 1000 + result.length });
    for (const loan of loans) add(`${loan.loanType === 'ADVANCE' ? 'Salary Advance' : 'Loan EMI'} #${loan.id}`, 'DEDUCTION', Math.min(Number(loan.emiAmount), Number(loan.outstandingAmount)));
    for (const reimbursement of reimbursements) add(reimbursement.componentCode ? `Reimbursement - ${reimbursement.componentCode}` : 'Reimbursement', 'EARNING', Number(reimbursement.amount));
    for (const adjustment of oneTimeAdjustments) {
      const isEarning = /EARNING/i.test(String(adjustment.type));
      add(
        `One-time ${isEarning ? 'earning' : 'deduction'} #${adjustment.id}`,
        isEarning ? 'EARNING' : 'DEDUCTION',
        Number(adjustment.amount),
      );
    }
    return {
      components: result,
      appliedAdjustments: {
        loanIds: loans.map((loan) => loan.id),
        reimbursementIds: reimbursements.map((claim) => claim.id),
        oneTimeAdjustmentIds: oneTimeAdjustments.map((adjustment) => adjustment.id),
      },
    };
  }

  static async settleApprovedPayrollAdjustments(prismaClient, payroll, actorId) {
    const loanDeductions = (payroll.components || [])
      .map((component) => ({ component, match: /(?:Loan EMI|Salary Advance) #(\d+)$/i.exec(component.name) }))
      .filter((row) => row.match);
    const start = new Date(Date.UTC(Number(payroll.year), Number(payroll.month) - 1, 1));
    const end = new Date(Date.UTC(Number(payroll.year), Number(payroll.month), 1));
    await prismaClient.$transaction(async (tx) => {
      for (const { component, match } of loanDeductions) {
        const loan = await tx.employeeLoan.findUnique({ where: { id: Number(match[1]) } });
        if (!loan || loan.status !== 'ACTIVE') continue;
        const amount = Math.min(Number(component.amount), Number(loan.outstandingAmount));
        if (amount <= 0) continue;
        const outstanding = Math.round((Number(loan.outstandingAmount) - amount) * 100) / 100;
        await tx.employeeLoanRepayment.create({ data: { loanId: loan.id, payrollRecordId: payroll.id, amount, paidOn: end } });
        await tx.employeeLoan.update({ where: { id: loan.id }, data: { outstandingAmount: outstanding, status: outstanding === 0 ? 'CLOSED' : 'ACTIVE' } });
      }
      await tx.employeeReimbursement.updateMany({
        where: { employeeId: payroll.employeeId, status: 'APPROVED', payrollRecordId: null, claimDate: { gte: start, lt: end } },
        data: { payrollRecordId: payroll.id },
      });
      // Settle one-time adjustments consumed by this record. The component
      // names encode `#<id>`, so we can link back exactly what was applied.
      const oneTimeMatches = (payroll.components || [])
        .map((component) => ({ component, match: /One-time (?:earning|deduction) #(\d+)$/i.exec(component.name || '') }))
        .filter((row) => row.match);
      for (const { match } of oneTimeMatches) {
        await tx.payrollOneTimeAdjustment.update({
          where: { id: Number(match[1]) },
          data: { payrollRecordId: payroll.id, appliedAt: new Date() },
        });
      }
    });
    await this.writePayrollAudit(prismaClient, { payrollRecordId: payroll.id, actorId, action: 'PAYROLL_ADJUSTMENTS_SETTLED', afterValue: { settledLoans: loanDeductions.map((row) => Number(row.match[1])) } });
  }

  // ---- Loans, advances and reimbursements ----

  static async listEmployeeLoans(reqUser, employeeId) {
    if (!this.canManagePayroll(reqUser)) throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view loans.', 403);
    return getPrisma().employeeLoan.findMany({ where: { employeeId: Number(employeeId) }, orderBy: { createdAt: 'desc' } });
  }

  static async createEmployeeLoan(reqUser, employeeId, data) {
    if (!this.canManagePayroll(reqUser)) throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage loans.', 403);
    const principal = Number(data.principalAmount); const emi = Number(data.emiAmount);
    if (!(principal > 0) || !(emi > 0) || emi > principal) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Principal and EMI must be positive, and EMI cannot exceed principal.', 400);
    const prismaClient = getPrisma();
    const employee = await prismaClient.employeeProfile.findUnique({ where: { id: Number(employeeId) }, select: { id: true } });
    if (!employee) throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    const loan = await prismaClient.employeeLoan.create({ data: {
      employeeId: employee.id, loanType: data.loanType || 'LOAN', principalAmount: principal, outstandingAmount: principal,
      emiAmount: emi, startDate: new Date(data.startDate), endDate: data.endDate ? new Date(data.endDate) : null, createdBy: Number(reqUser.id),
    } });
    await this.writePayrollAudit(prismaClient, { actorId: reqUser.id, action: 'EMPLOYEE_LOAN_CREATED', afterValue: loan });
    return loan;
  }

  static async recordLoanRepayment(reqUser, loanId, data) {
    if (!this.canManagePayroll(reqUser)) throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to record loan repayments.', 403);
    const prismaClient = getPrisma();
    const loan = await prismaClient.employeeLoan.findUnique({ where: { id: Number(loanId) } });
    if (!loan || loan.status !== 'ACTIVE') throw new AppError(AppErrorCodes.NOT_FOUND, 'Active loan not found.', 404);
    const amount = Number(data.amount);
    if (!(amount > 0) || amount > Number(loan.outstandingAmount)) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Repayment amount is invalid.', 400);
    const outstanding = Math.round((Number(loan.outstandingAmount) - amount) * 100) / 100;
    const [repayment, updated] = await prismaClient.$transaction([
      prismaClient.employeeLoanRepayment.create({ data: { loanId: loan.id, payrollRecordId: data.payrollRecordId ? Number(data.payrollRecordId) : null, amount, paidOn: data.paidOn ? new Date(data.paidOn) : new Date() } }),
      prismaClient.employeeLoan.update({ where: { id: loan.id }, data: { outstandingAmount: outstanding, status: outstanding === 0 ? 'CLOSED' : 'ACTIVE' } }),
    ]);
    await this.writePayrollAudit(prismaClient, { actorId: reqUser.id, action: 'LOAN_REPAYMENT_RECORDED', beforeValue: loan, afterValue: updated });
    return { repayment, loan: updated };
  }

  static async listReimbursements(reqUser, { employeeId, status } = {}) {
    if (!this.canManagePayroll(reqUser)) throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view reimbursements.', 403);
    const where = {}; if (employeeId) where.employeeId = Number(employeeId); if (status) where.status = status;
    return getPrisma().employeeReimbursement.findMany({ where, orderBy: { claimDate: 'desc' } });
  }

  static async createReimbursement(reqUser, data) {
    if (!this.canManagePayroll(reqUser)) throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage reimbursements.', 403);
    const amount = Number(data.amount); if (!(amount > 0)) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Reimbursement amount must be positive.', 400);
    const prismaClient = getPrisma();
    const claim = await prismaClient.employeeReimbursement.create({ data: { employeeId: Number(data.employeeId), componentCode: data.componentCode || null, claimDate: new Date(data.claimDate), amount, description: data.description || null, receiptPath: data.receiptPath || null } });
    await this.writePayrollAudit(prismaClient, { actorId: reqUser.id, action: 'REIMBURSEMENT_CREATED', afterValue: claim });
    return claim;
  }

  static async reviewReimbursement(reqUser, id, approve) {
    if (!this.canManagePayroll(reqUser)) throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review reimbursements.', 403);
    const prismaClient = getPrisma(); const before = await prismaClient.employeeReimbursement.findUnique({ where: { id: Number(id) } });
    if (!before || before.status !== 'PENDING') throw new AppError(AppErrorCodes.CONFLICT, 'Only pending reimbursement claims can be reviewed.', 409);
    const updated = await prismaClient.employeeReimbursement.update({ where: { id: before.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approvedBy: Number(reqUser.id), approvedAt: new Date() } });
    await this.writePayrollAudit(prismaClient, { actorId: reqUser.id, action: approve ? 'REIMBURSEMENT_APPROVED' : 'REIMBURSEMENT_REJECTED', beforeValue: before, afterValue: updated });
    return updated;
  }

  static async writePayrollAudit(prismaClient, { payrollRecordId = null, payrollPeriodId = null, actorId = null, action, reason = null, beforeValue = null, afterValue = null }) {
    return prismaClient.payrollAuditLog.create({ data: {
      payrollRecordId, payrollPeriodId, actorId: actorId == null ? null : Number(actorId), action, reason,
      beforeValue: beforeValue ? JSON.stringify(beforeValue) : null,
      afterValue: afterValue ? JSON.stringify(afterValue) : null,
    } });
  }

  // ---- Helpers ----

  // `payrollRecord.employeeId` is the employeeProfile.id (INT), NOT the user.id
  // that arrives on the request. For an EMPLOYEE, resolve their own profile
  // id and compare that, otherwise a valid self-request is rejected with 403.
  static async authorizePayrollAccess(reqUser, payrollRecord) {
    // Compare ids as strings: payroll records carry the INT profile id, but
    // callers/tests may supply or mock string identifiers.
    if ([Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser?.role)) {
      return;
    }
    if (reqUser?.role === Role.EMPLOYEE) {
      const profile = await this.getEmployeeProfileId(reqUser.id);
      if (!profile || String(profile.id) !== String(payrollRecord.employeeId)) {
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

  // The effective-dated revision chain means an employee can own several
  // structures over time, but only ONE open structure (active, no end date)
  // at any point. Every payroll-path lookup must resolve that open structure,
  // never `findUnique({ where: { employeeId } })` — employeeId is no longer
  // unique on salary_structures.
  static async findOpenSalaryStructure(prismaClient, employeeId, extra = {}) {
    return prismaClient.salaryStructure.findFirst({
      where: {
        employeeId: Number(employeeId),
        isActive: true,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      orderBy: [{ effectiveFrom: 'desc' }],
      ...extra,
    });
  }

  static async computeComponents(prismaClient, salaryStructure, month, year) {
    const source = salaryStructure.components.filter((component) => component.isActive !== false);
    this.validateStructureComponents(source);
    const values = {
      CTC: Number(salaryStructure.monthlyCTC) || 0,
      MONTHLY_CTC: Number(salaryStructure.monthlyCTC) || 0,
      ANNUAL_CTC: (Number(salaryStructure.monthlyCTC) || 0) * 12,
    };
    const pending = new Map(source.map((component) => [PayrollFormulaEngine.identifierFor(component.name), component]));
    const components = [];
    const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

    // Resolve components in dependency order. A prior validation guarantees
    // that this cannot loop forever and gives HR a useful error before save.
    while (pending.size) {
      let progressed = false;
      for (const [key, sc] of pending) {
        const type = sc.calculationType || 'FIXED';
        const dependencies = type === 'FORMULA' ? PayrollFormulaEngine.dependencies(sc.formula) : [];
        if (dependencies.some((dependency) => values[dependency] === undefined)) continue;
        let amount;
        if (type === 'PERCENTAGE_OF_CTC') amount = values.MONTHLY_CTC * (Number(sc.percentage) || 0) / 100;
        else if (type === 'PERCENTAGE_OF_BASIC') amount = (values.BASIC || values.BASIC_SALARY || 0) * (Number(sc.percentage) || 0) / 100;
        else if (type === 'FORMULA') amount = PayrollFormulaEngine.evaluate(sc.formula, values);
        else if (type === 'BALANCE') {
          const existing = components.filter((item) => item.type === sc.type).reduce((sum, item) => sum + item.amount, 0);
          amount = sc.type === 'EARNING' ? values.MONTHLY_CTC - existing : 0;
        } else amount = Number(sc.amount) || 0;
        amount = round(amount);
        if (amount < 0 && type === 'BALANCE') throw new AppError(AppErrorCodes.VALIDATION_ERROR, `Balance component "${sc.name}" would be negative.`, 400);
        values[key] = amount;
        components.push({ salaryComponentId: sc.id, name: sc.name, type: sc.type, amount, sortOrder: sc.sortOrder });
        pending.delete(key);
        progressed = true;
      }
      if (!progressed) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unable to resolve salary component dependencies.', 400);
    }
    return components;
  }

  static validateStructureComponents(components) {
    const seen = new Set();
    const graph = new Map();
    const names = new Set(components.map((component) => PayrollFormulaEngine.identifierFor(component.name)));
    let balanceEarnings = 0;
    for (const component of components) {
      const key = PayrollFormulaEngine.identifierFor(component.name);
      if (!key || seen.has(key)) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Each salary component must have a unique name.', 400);
      seen.add(key);
      const kind = component.calculationType || 'FIXED';
      if (kind === 'BALANCE' && component.type === 'EARNING') balanceEarnings += 1;
      if (balanceEarnings > 1) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Only one earning balance component is allowed.', 400);
      const dependencies = kind === 'FORMULA' ? PayrollFormulaEngine.dependencies(component.formula) : [];
      if (kind === 'FORMULA') {
        const unknown = dependencies.filter((dependency) => !names.has(dependency));
        if (unknown.length) throw new AppError(AppErrorCodes.VALIDATION_ERROR, `Unknown component reference(s) in ${component.name}: ${unknown.join(', ')}`, 400);
        // Supply harmless values for every known reference so validation
        // checks the whole expression, rather than stopping at its first
        // component identifier.
        try {
          PayrollFormulaEngine.evaluate(component.formula, Object.fromEntries([
            ['CTC', 1], ['MONTHLY_CTC', 1], ['ANNUAL_CTC', 12],
            ...[...names].map((name) => [name, 1]),
          ]));
        } catch (error) {
          throw new AppError(AppErrorCodes.VALIDATION_ERROR, `Invalid formula for ${component.name}: ${error.message}`, 400);
        }
      }
      graph.set(key, dependencies.filter((dependency) => names.has(dependency)));
    }
    const visiting = new Set(); const visited = new Set();
    const visit = (key) => {
      if (visiting.has(key)) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Circular salary component formula dependency detected.', 400);
      if (visited.has(key)) return;
      visiting.add(key); (graph.get(key) || []).forEach(visit); visiting.delete(key); visited.add(key);
    };
    [...graph.keys()].forEach(visit);
  }

  static formatPayrollRecord(payroll) {
    return {
      id: payroll.id,
      employeeId: payroll.employeeId,
      salaryStructureId: payroll.salaryStructureId,
      periodId: payroll.periodId ?? null,
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
      reviewComment: payroll.reviewComment ?? null,
      lockedAt: payroll.lockedAt ?? null,
      lockedBy: payroll.lockedBy ?? null,
      paidAt: payroll.paidAt ?? null,
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

    const structure = await this.findOpenSalaryStructure(prismaClient, profile.id);

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
