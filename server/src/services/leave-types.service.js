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

// The live `leave_types` and `leave_policies` tables predate this schema file:
// their primary keys are VARCHAR and there is no Prisma model, so — exactly as
// for the legacy `users` table — they are read and written with raw SQL.
class LeaveTypesService {
  static canManage(reqUser) {
    return (
      reqUser.role === Role.SUPER_ADMIN ||
      reqUser.role === Role.HR_ADMIN
    );
  }

  static canView(reqUser) {
    return this.canManage(reqUser);
  }

  static async listActive() {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT id, name, displayName, description, code, classification,
              isHalfDayAllowed, isActive
       FROM leave_types
       ORDER BY displayName ASC`
    );

    return rows.map((lt) => ({
      id: String(lt.id),
      name: lt.name,
      displayName: lt.displayName,
      description: lt.description,
      code: lt.code,
      classification: lt.classification,
      isHalfDayAllowed: Boolean(lt.isHalfDayAllowed),
      isActive: Boolean(lt.isActive),
      policy: null,
    }));
  }

  static async listAll(reqUser) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to manage leave types.', 403);
    }

    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT id, name, displayName, description, code, classification,
              isHalfDayAllowed, isActive
       FROM leave_types
       ORDER BY displayName ASC`
    );

    return rows.map((lt) => ({
      id: String(lt.id),
      name: lt.name,
      displayName: lt.displayName,
      description: lt.description,
      code: lt.code,
      classification: lt.classification,
      isHalfDayAllowed: Boolean(lt.isHalfDayAllowed),
      isActive: Boolean(lt.isActive),
      policy: null,
      createdAt: null,
    }));
  }

  static async create(reqUser, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create leave types.', 403);
    }

    const prismaClient = getPrisma();

    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM leave_types WHERE code = ? OR name = ? LIMIT 1',
      data.code,
      data.name
    );

    if (existing.length) {
      throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A leave type with this code or name already exists.', 409);
    }

    const now = new Date();
    const created = await prismaClient.$queryRawUnsafe(
      `INSERT INTO leave_types
        (name, displayName, description, code, classification, isHalfDayAllowed, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.name,
      data.displayName,
      data.description || null,
      data.code,
      data.classification || 'PAID',
      data.isHalfDayAllowed ?? true,
      data.isActive ?? true,
      now,
      now
    );

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'CREATE_LEAVE_TYPE',
        entityType: 'LeaveType',
        entityId: String(created.insertId),
      },
    });

    logger.info('Leave type created', { leaveTypeId: created.insertId, actorId: reqUser.id });

    return {
      id: String(created.insertId),
      name: data.name,
      displayName: data.displayName,
      code: data.code,
    };
  }

  static async update(reqUser, leaveTypeId, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update leave types.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM leave_types WHERE id = ? LIMIT 1',
      leaveTypeId
    );

    if (!existing.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave type not found.', 404);
    }

    const updated = await prismaClient.$queryRawUnsafe(
      `UPDATE leave_types
        SET displayName = ?, description = ?, classification = ?, isHalfDayAllowed = ?, isActive = ?
       WHERE id = ?`,
      data.displayName !== undefined ? data.displayName : existing[0].displayName,
      data.description !== undefined ? data.description : existing[0].description,
      data.classification !== undefined ? data.classification : existing[0].classification,
      data.isHalfDayAllowed !== undefined ? data.isHalfDayAllowed : existing[0].isHalfDayAllowed,
      data.isActive !== undefined ? data.isActive : existing[0].isActive,
      leaveTypeId
    );

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'UPDATE_LEAVE_TYPE',
        entityType: 'LeaveType',
        entityId: leaveTypeId,
      },
    });

    logger.info('Leave type updated', { leaveTypeId });

    return { id: String(leaveTypeId), displayName: data.displayName };
  }

  static async delete(reqUser, leaveTypeId) {
    if (reqUser.role !== Role.SUPER_ADMIN) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only Super Admin can delete leave types.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM leave_types WHERE id = ? LIMIT 1',
      leaveTypeId
    );

    if (!existing.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave type not found.', 404);
    }

    await prismaClient.$executeRawUnsafe('DELETE FROM leave_types WHERE id = ?', [leaveTypeId]);

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'DELETE_LEAVE_TYPE',
        entityType: 'LeaveType',
        entityId: leaveTypeId,
      },
    });

    logger.info('Leave type deleted', { leaveTypeId });
    return { success: true };
  }
}

module.exports = { LeaveTypesService };
