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

class PayrollService {
  // ---- Role checks ----

  static canManagePayroll(reqUser) {
    return [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role);
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

    const structure = await getPrisma().salaryStructure.create({
      data: {
        employeeId,
        monthlyCTC,
        currency: currency || 'INR',
        isActive: isActive !== undefined ? isActive : true,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        components: {
          create: (components || []).map((c) => ({
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

    this.authorizePayrollAccess(reqUser, payroll);

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

    this.authorizePayrollAccess(reqUser, payslip.payrollRecord);

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

    // Reuse existing authorization (covers all four roles)
    this.authorizePayrollAccess(reqUser, payroll);

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
      payslipGeneratedAt: payslip.generatedAt,
    });

    return {
      pdfBuffer,
      filename: getPayslipFilename(profile?.employeeCode, payroll.month, payroll.year),
    };
  }

  // ---- Helpers ----

  static authorizePayrollAccess(reqUser, payrollRecord) {
    if ([Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      return;
    }
    if (reqUser.role === Role.EMPLOYEE) {
      if (payrollRecord.employeeId !== reqUser.id) {
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
