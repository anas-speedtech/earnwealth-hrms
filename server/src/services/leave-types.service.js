const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');
const { getTodayIST, toISTDate, formatDateKey } = require('../utils/date-utils');

let prismaInstance;
function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

class LeaveTypesService {
  static async listActive() {
    const prismaClient = getPrisma();
    const types = await prismaClient.leaveType.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' },
      include: {
        policies: {
          where: {
            isActive: true,
            effectiveFrom: { lte: getTodayIST() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: getTodayIST() } }],
          },
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

  static async listAll(reqUser) {
    if (![Role.SUPER_ADMIN, Role.ADMIN, Role.HR].includes(reqUser.role)) {
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

  static async create(reqUser, data) {
    if (![Role.SUPER_ADMIN, Role.ADMIN, Role.HR].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create leave types.', 403);
    }

    const prismaClient = getPrisma();

    // Check duplicate code
    const existing = await prismaClient.leaveType.findFirst({
      where: { OR: [{ code: data.code }, { name: data.name }] },
    });
    if (existing) {
      throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A leave type with this code or name already exists.', 409);
    }

    const result = await prismaClient.$transaction(async (tx) => {
      const leaveType = await tx.leaveType.create({
        data: {
          name: data.name,
          displayName: data.displayName,
          description: data.description || null,
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
        },
      });

      return leaveType;
    });

    logger.info('Leave type created', { leaveTypeId: result.id, actorId: reqUser.id });

    return {
      id: result.id,
      name: result.name,
      displayName: result.displayName,
      code: result.code,
    };
  }

  static async update(reqUser, leaveTypeId, data) {
    if (![Role.SUPER_ADMIN, Role.ADMIN, Role.HR].includes(reqUser.role)) {
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
        displayName: data.displayName ?? existing.displayName,
        description: data.description !== undefined ? data.description : existing.description,
        classification: data.classification ?? existing.classification,
        isHalfDayAllowed: data.isHalfDayAllowed ?? existing.isHalfDayAllowed,
        isActive: data.isActive ?? existing.isActive,
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

    return {
      id: updated.id,
      name: updated.name,
      displayName: updated.displayName,
      code: updated.code,
    };
  }

  static async delete(reqUser, leaveTypeId) {
    if (reqUser.role !== Role.SUPER_ADMIN) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only Super Admin can delete leave types.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.leaveType.findUnique({
      where: { id: leaveTypeId },
    });
    if (!existing) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave type not found.', 404);
    }

    await prismaClient.leaveType.delete({
      where: { id: leaveTypeId },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'DELETE_LEAVE_TYPE',
        entityType: 'LeaveType',
        entityId: leaveTypeId,
      },
    });

    return { success: true };
  }
}

module.exports = { LeaveTypesService };
