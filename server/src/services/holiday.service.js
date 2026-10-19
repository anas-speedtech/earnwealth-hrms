const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

let prismaInstance;

function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

// Reads and maintains the company holiday calendar. The `holidays` table is
// managed by Prisma (the model exists in schema.prisma), so this service uses
// the generated client like the other model-backed services.
class HolidayService {
  static canView(reqUser) {
    return [Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE].includes(reqUser.role);
  }

  static canManage(reqUser) {
    return [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role);
  }

  static async list(reqUser) {
    if (!this.canView(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view holidays.', 403);
    }

    const prismaClient = getPrisma();
    const rows = await prismaClient.holiday.findMany({
      orderBy: { date: 'asc' },
    });

    return rows.map((h) => ({
      id: h.id,
      name: h.name,
      date: h.date,
      isRecurring: h.isRecurring,
    }));
  }

  static async getById(reqUser, holidayId) {
    if (!this.canView(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view holidays.', 403);
    }

    const prismaClient = getPrisma();
    const holiday = await prismaClient.holiday.findUnique({
      where: { id: Number(holidayId) },
    });

    if (!holiday) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Holiday not found.', 404);
    }

    return {
      id: holiday.id,
      name: holiday.name,
      date: holiday.date,
      isRecurring: holiday.isRecurring,
    };
  }

  static async create(reqUser, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create holidays.', 403);
    }

    const prismaClient = getPrisma();

    const existing = await prismaClient.holiday.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A holiday with this name already exists.', 409);
    }

    const now = new Date();
    const holiday = await prismaClient.holiday.create({
      data: {
        name: data.name,
        date: new Date(data.date),
        isRecurring: data.isRecurring ?? false,
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'CREATE_HOLIDAY',
        entityType: 'Holiday',
        entityId: holiday.id,
      },
    });

    logger.info('Holiday created', { holidayId: holiday.id, name: data.name });

    return {
      id: holiday.id,
      name: holiday.name,
      date: holiday.date,
      isRecurring: holiday.isRecurring,
    };
  }

  static async update(reqUser, holidayId, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update holidays.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.holiday.findUnique({
      where: { id: holidayId },
    });

    if (!existing) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Holiday not found.', 404);
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await prismaClient.holiday.findUnique({
        where: { name: data.name },
      });

      if (duplicate) {
        throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A holiday with this name already exists.', 409);
      }
    }

    const updated = await prismaClient.holiday.update({
      where: { id: holidayId },
      data: {
        name: data.name !== undefined ? data.name : existing.name,
        date: data.date !== undefined ? new Date(data.date) : existing.date,
        isRecurring: data.isRecurring !== undefined ? data.isRecurring : existing.isRecurring,
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'UPDATE_HOLIDAY',
        entityType: 'Holiday',
        entityId: holidayId,
      },
    });

    logger.info('Holiday updated', { holidayId });

    return {
      id: updated.id,
      name: updated.name,
      date: updated.date,
      isRecurring: updated.isRecurring,
    };
  }

  static async delete(reqUser, holidayId) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to delete holidays.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.holiday.findUnique({
      where: { id: holidayId },
    });

    if (!existing) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Holiday not found.', 404);
    }

    await prismaClient.holiday.delete({
      where: { id: holidayId },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'DELETE_HOLIDAY',
        entityType: 'Holiday',
        entityId: holidayId,
      },
    });

    logger.info('Holiday deleted', { holidayId });

    return { message: 'Holiday deleted successfully.' };
  }
}

module.exports = { HolidayService };
