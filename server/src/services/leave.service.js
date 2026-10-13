const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');
const {
  getTodayIST,
  toISTDate,
  countWorkingDays,
  formatDateKey,
  canAccessAll,
  resolveLeaveAccess,
} = require('../utils/date-utils');

let prismaInstance;
function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

const PAGE_SIZE = 20;
const DEC_0 = 0;
const DEC_1 = 1;

class LeaveService {
  // ---- Leave Types / Policies ----

  static async listLeaveTypes() {
    const prismaClient = getPrisma();
    const types = await prismaClient.leaveType.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' },
      include: {
        policies: {
          where: { isActive: true },
        },
      },
    });
    return types.map((lt) => ({
      id: lt.id,
      name: lt.name,
      displayName: lt.displayName,
      description: lt.description,
      code: lt.code,
      classification: lt.classification,
      isHalfDayAllowed: lt.isHalfDayAllowed,
      policy: lt.policies[0] || null,
    }));
  }

  static async getAllLeaveTypes(reqUser) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage leave types.', 403);
    }

    const prismaClient = getPrisma();
    const types = await prismaClient.leaveType.findMany({
      orderBy: { displayName: 'asc' },
      include: {
        policies: {
          where: { isActive: true },
        },
      },
    });

    return types.map((lt) => ({
      id: lt.id,
      name: lt.name,
      displayName: lt.displayName,
      description: lt.description,
      code: lt.code,
      classification: lt.classification,
      isHalfDayAllowed: lt.isHalfDayAllowed,
      isActive: lt.isActive,
      policy: lt.policies[0] || null,
      createdAt: lt.createdAt,
    }));
  }

  static async createLeaveType(reqUser, data) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create leave types.', 403);
    }

    const prismaClient = getPrisma();

    const result = await prismaClient.$transaction(async (tx) => {
      const leaveType = await tx.leaveType.create({
        data: {
          name: data.name,
          displayName: data.displayName,
          description: data.description,
          code: data.code,
          classification: data.classification || 'PAID',
          isHalfDayAllowed: data.isHalfDayAllowed ?? true,
          isActive: data.isActive ?? true,
        },
      });

      await tx.leavePolicy.create({
        data: {
          leaveTypeId: leaveType.id,
          annualEntitlementDays: data.annualEntitlementDays || 0,
          accrualFrequency: data.accrualFrequency || 'ANNUAL',
          monthlyAccrualDays: data.monthlyAccrualDays || null,
          carryForwardEnabled: data.carryForwardEnabled || false,
          maxCarryForwardDays: data.maxCarryForwardDays || null,
          minDaysBeforeApply: data.minDaysBeforeApply ?? 0,
          maxConsecutiveDays: data.maxConsecutiveDays || null,
          applicableTo: data.applicableTo || 'ALL',
          departmentIds: data.departmentIds || null,
          effectiveFrom: toISTDate(data.effectiveFrom || formatDateKey(getTodayIST())),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'CREATE_LEAVE_TYPE',
          entityType: 'LeaveType',
          entityId: leaveType.id,
          metadata: JSON.stringify({ name: leaveType.displayName }),
        },
      });

      return leaveType;
    });

    logger.info('Leave type created', { leaveTypeId: result.id, actorId: reqUser.id });

    return { id: result.id, name: result.name, displayName: result.displayName, code: result.code };
  }

  static async updateLeaveType(reqUser, leaveTypeId, data) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update leave types.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.leaveType.findUnique({
      where: { id: leaveTypeId },
    });
    if (!existing) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave type not found.', 404);
    }

    const updated = await prismaClient.leaveType.update({
      where: { id: leaveTypeId },
      data: {
        displayName: data.displayName,
        description: data.description,
        classification: data.classification,
        isHalfDayAllowed: data.isHalfDayAllowed,
        isActive: data.isActive,
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'UPDATE_LEAVE_TYPE',
        entityType: 'LeaveType',
        entityId: leaveTypeId,
      },
    });

    return { id: updated.id, name: updated.name, displayName: updated.displayName };
  }

  // ---- Leave Balance ----

  static async getMyBalances(reqUser) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const year = getTodayIST().getFullYear();
    const balances = await prismaClient.leaveBalance.findMany({
      where: { employeeId: profile.id, year },
      include: {
        leaveType: {
          select: { id: true, displayName: true, code: true, classification: true },
        },
      },
    });

    return balances.map((b) => ({
      id: b.id,
      leaveTypeId: b.leaveTypeId,
      leaveTypeName: b.leaveType.displayName,
      leaveTypeCode: b.leaveType.code,
      classification: b.leaveType.classification,
      openingBalance: Number(b.openingBalance),
      accruedBalance: Number(b.accruedBalance),
      usedBalance: Number(b.usedBalance),
      reservedBalance: Number(b.reservedBalance),
      availableBalance: Number(b.availableBalance),
      year: b.year,
    }));
  }

  static async getEmployeeBalances(reqUser, targetEmployeeId) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view employee balances.', 403);
    }

    const prismaClient = getPrisma();
    const resolvedId = await resolveLeaveAccess(reqUser, targetEmployeeId, prismaClient);

    const year = getTodayIST().getFullYear();
    const balances = await prismaClient.leaveBalance.findMany({
      where: { employeeId: resolvedId, year },
      include: {
        leaveType: {
          select: { id: true, displayName: true, code: true, classification: true },
        },
      },
    });

    return balances.map((b) => ({
      id: b.id,
      employeeId: b.employeeId,
      leaveTypeId: b.leaveTypeId,
      leaveTypeName: b.leaveType.displayName,
      leaveTypeCode: b.leaveType.code,
      classification: b.leaveType.classification,
      openingBalance: Number(b.openingBalance),
      accruedBalance: Number(b.accruedBalance),
      usedBalance: Number(b.usedBalance),
      reservedBalance: Number(b.reservedBalance),
      availableBalance: Number(b.availableBalance),
      year: b.year,
    }));
  }

  // ---- Leave Request (Employee) ----

  static async createRequest(reqUser, data) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true, status: true, userId: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }
    if (profile.status !== 'ACTIVE') {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Inactive employees cannot submit leave requests.', 400);
    }

    const startDate = toISTDate(data.startDate);
    const endDate = toISTDate(data.endDate);
    const today = getTodayIST();

    // Validate dates
    if (startDate > endDate) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Start date cannot be after end date.', 400);
    }

    // Load leave type
    const leaveType = await prismaClient.leaveType.findUnique({
      where: { id: data.leaveTypeId },
    });
    if (!leaveType || !leaveType.isActive) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Invalid or inactive leave type selected.', 400);
    }

    // Validate half-day
    if (data.isHalfDay && !leaveType.isHalfDayAllowed) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Half-day leave is not allowed for this leave type.', 400);
    }
    if (data.isHalfDay && !data.halfDayPeriod) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Half-day period is required for half-day leave.', 400);
    }
    if (!data.isHalfDay && data.halfDayPeriod) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Half-day period cannot be set for full-day leave.', 400);
    }

    // Load policy
    const policy = await prismaClient.leavePolicy.findFirst({
      where: {
        leaveTypeId: data.leaveTypeId,
        isActive: true,
        effectiveFrom: { lte: endDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }],
      },
    });
    if (!policy) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'No active leave policy found for the selected period.', 400);
    }

    // Check min days before apply
    if (policy.minDaysBeforeApply > 0) {
      const minStartDate = new Date(today.getTime() + policy.minDaysBeforeApply * 86400000);
      if (startDate < minStartDate) {
        throw new AppError(
          AppErrorCodes.INVALID_INPUT,
          `Leave must be applied at least ${policy.minDaysBeforeApply} day(s) in advance.`,
          400,
        );
      }
    }

    // Fetch holidays for date range
    const holidays = await prismaClient.holiday.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        isActive: true,
      },
      select: { date: true },
    });
    const holidayDateSet = new Set(holidays.map((h) => formatDateKey(h.date)));

    // Calculate working days
    const totalDays = countWorkingDays(startDate, endDate, holidayDateSet, data.isHalfDay);
    if (totalDays <= 0) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Selected dates contain no valid working days for leave.', 400);
    }

    // Check max consecutive days
    if (policy.maxConsecutiveDays && totalDays > policy.maxConsecutiveDays) {
      throw new AppError(
        AppErrorCodes.INVALID_INPUT,
        `Maximum ${policy.maxConsecutiveDays} consecutive days allowed for this leave type.`,
        400,
      );
    }

    // Check for overlapping requests
    const overlapping = await prismaClient.leaveRequest.findFirst({
      where: {
        employeeId: profile.id,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        ],
      },
    });
    if (overlapping) {
      throw new AppError(AppErrorCodes.LEAVE_OVERLAP, 'You already have a leave request overlapping with these dates.', 409);
    }

    // Check balance
    const year = startDate.getFullYear();
    const balance = await prismaClient.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: profile.id,
          leaveTypeId: data.leaveTypeId,
          year,
        },
      },
    });

    const availableBalance = balance ? Number(balance.availableBalance) : 0;
    if (availableBalance < totalDays) {
      throw new AppError(
        AppErrorCodes.LEAVE_BALANCE_EXCEEDED,
        `Insufficient leave balance. Available: ${availableBalance.toFixed(2)} days, Required: ${totalDays.toFixed(2)} days.`,
        400,
      );
    }

    // Create request atomically
    const result = await prismaClient.$transaction(async (tx) => {
      const request = await tx.leaveRequest.create({
        data: {
          employeeId: profile.id,
          leaveTypeId: data.leaveTypeId,
          startDate,
          endDate,
          isHalfDay: data.isHalfDay || false,
          halfDayPeriod: data.halfDayPeriod || null,
          totalDays,
          reason: data.reason,
          status: 'PENDING',
        },
      });

      // Reserve balance
      if (balance) {
        const newReserved = Number(balance.reservedBalance) + totalDays;
        const newAvailable = Number(balance.availableBalance) - totalDays;

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            reservedBalance: newReserved,
            availableBalance: newAvailable,
          },
        });

        await tx.leaveTransaction.create({
          data: {
            employeeId: profile.id,
            leaveTypeId: data.leaveTypeId,
            leaveRequestId: request.id,
            type: 'DEDUCTION',
            amount: totalDays,
            balanceBefore: Number(balance.availableBalance),
            balanceAfter: newAvailable,
            reason: `Leave request reserved: ${request.id}`,
            createdBy: reqUser.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'CREATE_LEAVE_REQUEST',
          entityType: 'LeaveRequest',
          entityId: request.id,
          metadata: JSON.stringify({ leaveTypeId: data.leaveTypeId, totalDays, startDate, endDate }),
        },
      });

      return request;
    });

    logger.info('Leave request created', { requestId: result.id, employeeId: profile.id });

    return {
      id: result.id,
      leaveTypeId: result.leaveTypeId,
      startDate: result.startDate,
      endDate: result.endDate,
      isHalfDay: result.isHalfDay,
      halfDayPeriod: result.halfDayPeriod,
      totalDays: Number(result.totalDays),
      reason: result.reason,
      status: result.status,
      createdAt: result.createdAt,
    };
  }

  static async cancelRequest(reqUser, requestId) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const request = await prismaClient.leaveRequest.findUnique({
      where: { id: requestId },
      include: { leaveType: true },
    });
    if (!request) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave request not found.', 404);
    }

    if (request.employeeId !== profile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only cancel your own leave requests.', 403);
    }

    if (request.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Cannot cancel a ${request.status.toLowerCase()} leave request.`, 409);
    }

    const result = await prismaClient.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      });

      // Release reserved balance
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: profile.id,
            leaveTypeId: request.leaveTypeId,
            year: request.startDate.getFullYear(),
          },
        },
      });

      if (balance) {
        const totalDays = Number(request.totalDays);
        const newReserved = Number(balance.reservedBalance) - totalDays;
        const newAvailable = Number(balance.availableBalance) + totalDays;

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            reservedBalance: Math.max(0, newReserved),
            availableBalance: newAvailable,
          },
        });

        await tx.leaveTransaction.create({
          data: {
            employeeId: profile.id,
            leaveTypeId: request.leaveTypeId,
            leaveRequestId: requestId,
            type: 'RELEASE',
            amount: totalDays,
            balanceBefore: Number(balance.availableBalance),
            balanceAfter: newAvailable,
            reason: `Cancelled leave request: ${requestId}`,
            createdBy: reqUser.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'CANCEL_LEAVE_REQUEST',
          entityType: 'LeaveRequest',
          entityId: requestId,
        },
      });

      return updated;
    });

    logger.info('Leave request cancelled', { requestId, employeeId: profile.id });
    return result;
  }

  // ---- Employee leave history ----

  static async getMyRequests(reqUser, { page = 1, status } = {}) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const where = { employeeId: profile.id };
    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * PAGE_SIZE;

    const [requests, total] = await Promise.all([
      prismaClient.leaveRequest.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
        include: {
          leaveType: { select: { id: true, displayName: true, code: true } },
        },
      }),
      prismaClient.leaveRequest.count({ where }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      requests: requests.map((r) => ({
        id: r.id,
        leaveTypeId: r.leaveTypeId,
        leaveTypeName: r.leaveType.displayName,
        leaveTypeCode: r.leaveType.code,
        startDate: r.startDate,
        endDate: r.endDate,
        isHalfDay: r.isHalfDay,
        halfDayPeriod: r.halfDayPeriod,
        totalDays: Number(r.totalDays),
        reason: r.reason,
        status: r.status,
        reviewComment: r.reviewComment,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
      })),
      pagination: { page, pageSize: PAGE_SIZE, total, pages },
    };
  }

  // ---- HR Review ----

  static async getPendingRequests(reqUser) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review leave requests.', 403);
    }

    const prismaClient = getPrisma();
    const requests = await prismaClient.leaveRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        employee: {
          include: {
            user: { select: { email: true } },
            department: { select: { name: true } },
          },
        },
        leaveType: { select: { id: true, displayName: true, code: true } },
      },
    });

    return requests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      employeeCode: r.employee.employeeCode,
      employeeEmail: r.employee.user.email,
      departmentName: r.employee.department?.name || '',
      leaveTypeId: r.leaveTypeId,
      leaveTypeName: r.leaveType.displayName,
      leaveTypeCode: r.leaveType.code,
      startDate: r.startDate,
      endDate: r.endDate,
      isHalfDay: r.isHalfDay,
      totalDays: Number(r.totalDays),
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  static async getAllRequests(reqUser, { page = 1, status, employeeId } = {}) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view leave requests.', 403);
    }

    const prismaClient = getPrisma();
    const where = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const skip = (page - 1) * PAGE_SIZE;

    const [requests, total] = await Promise.all([
      prismaClient.leaveRequest.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            include: {
              user: { select: { email: true } },
              department: { select: { name: true } },
            },
          },
          leaveType: { select: { id: true, displayName: true, code: true } },
        },
      }),
      prismaClient.leaveRequest.count({ where }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      requests: requests.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
        employeeCode: r.employee.employeeCode,
        employeeEmail: r.employee.user.email,
        departmentName: r.employee.department?.name || '',
        leaveTypeId: r.leaveTypeId,
        leaveTypeName: r.leaveType.displayName,
        leaveTypeCode: r.leaveType.code,
        startDate: r.startDate,
        endDate: r.endDate,
        isHalfDay: r.isHalfDay,
        totalDays: Number(r.totalDays),
        reason: r.reason,
        status: r.status,
        reviewComment: r.reviewComment,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
      })),
      pagination: { page, pageSize: PAGE_SIZE, total, pages },
    };
  }

  static async getRequestDetail(reqUser, requestId) {
    const prismaClient = getPrisma();
    const request = await prismaClient.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: {
          include: {
            user: { select: { email: true } },
            department: { select: { name: true } },
          },
        },
        leaveType: true,
      },
    });

    if (!request) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave request not found.', 404);
    }

    // Check access
    const isSelf = reqUser.id === request.employee.userId;
    if (!isSelf && !canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view this request.', 403);
    }

    return {
      id: request.id,
      employeeId: request.employeeId,
      employeeName: `${request.employee.firstName} ${request.employee.lastName}`,
      employeeCode: request.employee.employeeCode,
      employeeEmail: request.employee.user.email,
      departmentName: request.employee.department?.name || '',
      leaveTypeId: request.leaveTypeId,
      leaveTypeName: request.leaveType.displayName,
      leaveTypeCode: request.leaveType.code,
      classification: request.leaveType.classification,
      startDate: request.startDate,
      endDate: request.endDate,
      isHalfDay: request.isHalfDay,
      halfDayPeriod: request.halfDayPeriod,
      totalDays: Number(request.totalDays),
      reason: request.reason,
      status: request.status,
      reviewComment: request.reviewComment,
      reviewedAt: request.reviewedAt,
      createdAt: request.createdAt,
    };
  }

  static async approveRequest(reqUser, requestId, reviewComment) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to approve leave requests.', 403);
    }

    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });

    const request = await prismaClient.leaveRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave request not found.', 404);
    }

    if (request.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Request is already ${request.status.toLowerCase()}.`, 409);
    }

    // Cannot approve own request
    if (request.employeeId === profile?.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot approve your own leave request.', 403);
    }

    const now = new Date();
    const year = request.startDate.getFullYear();

    const result = await prismaClient.$transaction(async (tx) => {
      // Find balance
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
      });

      const totalDays = Number(request.totalDays);

      if (balance) {
        const newUsed = Number(balance.usedBalance) + totalDays;
        const newReserved = Math.max(0, Number(balance.reservedBalance) - totalDays);
        const newAvailable = Number(balance.availableBalance) - totalDays;

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            usedBalance: newUsed,
            reservedBalance: newReserved,
            availableBalance: Math.max(0, newAvailable),
          },
        });

        await tx.leaveTransaction.create({
          data: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            leaveRequestId: request.id,
            type: 'DEDUCTION',
            amount: totalDays,
            balanceBefore: Number(balance.availableBalance),
            balanceAfter: Math.max(0, newAvailable),
            reason: `Approved leave: ${request.id}`,
            createdBy: reqUser.id,
          },
        });
      }

      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedBy: reqUser.id,
          reviewedAt: now,
          reviewComment: reviewComment || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'APPROVE_LEAVE_REQUEST',
          entityType: 'LeaveRequest',
          entityId: requestId,
          metadata: JSON.stringify({ employeeId: request.employeeId, totalDays }),
        },
      });

      return updated;
    });

    logger.info('Leave request approved', { requestId, reviewerId: reqUser.id });

    return result;
  }

  static async rejectRequest(reqUser, requestId, reviewComment) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to reject leave requests.', 403);
    }

    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });

    const request = await prismaClient.leaveRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave request not found.', 404);
    }

    if (request.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Request is already ${request.status.toLowerCase()}.`, 409);
    }

    if (request.employeeId === profile?.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot reject your own leave request.', 403);
    }

    if (!reviewComment || !reviewComment.trim()) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'A rejection reason is required.', 400);
    }

    const now = new Date();
    const year = request.startDate.getFullYear();

    const result = await prismaClient.$transaction(async (tx) => {
      // Release reserved balance back to available
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
      });

      const totalDays = Number(request.totalDays);

      if (balance) {
        const newReserved = Math.max(0, Number(balance.reservedBalance) - totalDays);
        const newAvailable = Number(balance.availableBalance) + totalDays;

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            reservedBalance: newReserved,
            availableBalance: newAvailable,
          },
        });

        await tx.leaveTransaction.create({
          data: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            leaveRequestId: request.id,
            type: 'RELEASE',
            amount: totalDays,
            balanceBefore: Number(balance.availableBalance),
            balanceAfter: newAvailable,
            reason: `Rejected leave: ${request.id}`,
            createdBy: reqUser.id,
          },
        });
      }

      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          reviewedBy: reqUser.id,
          reviewedAt: now,
          reviewComment,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'REJECT_LEAVE_REQUEST',
          entityType: 'LeaveRequest',
          entityId: requestId,
          metadata: JSON.stringify({ employeeId: request.employeeId, reason: reviewComment }),
        },
      });

      return updated;
    });

    logger.info('Leave request rejected', { requestId, reviewerId: reqUser.id });

    return result;
  }

  // ---- Leave Balance Initialization / Accrual ----

  static async initializeBalances(reqUser, employeeProfileId) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to initialize balances.', 403);
    }

    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { id: employeeProfileId },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const currentYear = getTodayIST().getFullYear();
    const policies = await prismaClient.leavePolicy.findMany({
      where: { isActive: true },
      include: { leaveType: { where: { isActive: true } } },
    });

    const created = [];

    await prismaClient.$transaction(async (tx) => {
      for (const policy of policies) {
        const existing = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: profile.id,
              leaveTypeId: policy.leaveTypeId,
              year: currentYear,
            },
          },
        });

        if (!existing) {
          const balance = await tx.leaveBalance.create({
            data: {
              employeeId: profile.id,
              leaveTypeId: policy.leaveTypeId,
              openingBalance: policy.annualEntitlementDays,
              accruedBalance: 0,
              usedBalance: 0,
              reservedBalance: 0,
              availableBalance: policy.annualEntitlementDays,
              year: currentYear,
            },
          });

          await tx.leaveTransaction.create({
            data: {
              employeeId: profile.id,
              leaveTypeId: policy.leaveTypeId,
              type: 'ACCRUAL',
              amount: policy.annualEntitlementDays,
              balanceBefore: 0,
              balanceAfter: policy.annualEntitlementDays,
              reason: 'Initial balance allocation',
              createdBy: reqUser.id,
            },
          });

          created.push(balance);
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'INITIALIZE_LEAVE_BALANCES',
          entityType: 'EmployeeProfile',
          entityId: employeeProfileId,
        },
      });
    });

    return { employeeId: profile.id, balancesCreated: created.length, year: currentYear };
  }

  static async processMonthlyAccrual(reqUser) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to process accruals.', 403);
    }

    const prismaClient = getPrisma();
    const now = getTodayIST();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    const policies = await prismaClient.leavePolicy.findMany({
      where: {
        isActive: true,
        accrualFrequency: 'MONTHLY',
        monthlyAccrualDays: { not: null },
      },
      include: { leaveType: true },
    });

    let processedCount = 0;

    await prismaClient.$transaction(async (tx) => {
      for (const policy of policies) {
        const employees = await tx.employeeProfile.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true },
        });

        for (const emp of employees) {
          const balance = await tx.leaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: emp.id,
                leaveTypeId: policy.leaveTypeId,
                year: currentYear,
              },
            },
          });

          if (!balance) continue;

          // Prevent duplicate accrual for the same month
          if (balance.lastAccruedAt) {
            const lastAccrued = new Date(balance.lastAccruedAt);
            const lastMonth = lastAccrued.getMonth();
            const lastYear = lastAccrued.getFullYear();
            if (lastMonth === currentMonth && lastYear === currentYear) {
              continue; // Already accrued this month
            }
          }

          const accrualAmount = Number(policy.monthlyAccrualDays);
          const newAccrued = Number(balance.accruedBalance) + accrualAmount;
          const newAvailable = Number(balance.availableBalance) + accrualAmount;

          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              accruedBalance: newAccrued,
              availableBalance: newAvailable,
              lastAccruedAt: now,
            },
          });

          await tx.leaveTransaction.create({
            data: {
              employeeId: emp.id,
              leaveTypeId: policy.leaveTypeId,
              type: 'ACCRUAL',
              amount: accrualAmount,
              balanceBefore: Number(balance.availableBalance),
              balanceAfter: newAvailable,
              reason: `Monthly accrual ${monthKey}`,
              createdBy: reqUser.id,
            },
          });

          processedCount++;
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'PROCESS_MONTHLY_ACCRUAL',
          entityType: 'LeaveBalance',
          entityId: monthKey,
          metadata: JSON.stringify({ processedCount }),
        },
      });
    });

    return { processedCount, month: monthKey };
  }
}

module.exports = { LeaveService };
