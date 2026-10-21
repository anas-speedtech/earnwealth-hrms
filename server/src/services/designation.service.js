const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

let prisma;

function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

// The live `designations` table predates this schema file: its primary key is a
// VARCHAR and it has no Prisma model, so this service — like the legacy `users`
// table code — uses raw SQL. The counts are derived from the `employees.designation`
// column, which holds the designation name for each employee.
class DesignationService {
  static canManage(reqUser) {
    return reqUser.role === Role.SUPER_ADMIN || reqUser.role === Role.HR_ADMIN;
  }

  static canView(reqUser) {
    return [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role);
  }

  static async countAssigned(reqUser, designationName) {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT COUNT(*) AS total FROM employees WHERE designation = ? AND isActive = 1',
      designationName
    );
    const total = Number(rows[0]?.total || 0);
    return total;
  }

  static async list(reqUser) {
    if (!this.canView(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view designations.', 403);
    }

    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, name, description, isActive FROM designations ORDER BY name ASC'
    );

    return Promise.all(rows.map(async (d) => ({
      id: String(d.id),
      name: d.name,
      description: d.description,
      isActive: Boolean(d.isActive),
      employeeCount: await this.countAssigned(reqUser, d.name),
    })));
  }

  static async getById(reqUser, designationId) {
    if (!this.canView(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view designations.', 403);
    }

    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, name, description, isActive FROM designations WHERE id = ? LIMIT 1',
      designationId
    );

    const desig = rows[0];
    if (!desig) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Designation not found.', 404);
    }

    return {
      id: String(desig.id),
      name: desig.name,
      description: desig.description,
      isActive: Boolean(desig.isActive),
      employeeCount: await this.countAssigned(reqUser, desig.name),
    };
  }

  static async create(reqUser, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create designations.', 403);
    }

    const prismaClient = getPrisma();

    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM designations WHERE name = ? LIMIT 1',
      data.name
    );

    if (existing.length) {
      throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A designation with this name already exists.', 409);
    }

    const now = new Date();
    const id = require('crypto').randomUUID();
    const desig = await prismaClient.$queryRawUnsafe(
      'INSERT INTO designations (id, name, description, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      data.name,
      data.description || null,
      data.isActive !== undefined ? data.isActive : true,
      now,
      now
    );

    // Audit writes are best-effort: the audit_logs table stores actorId as
    // VARCHAR, and the designation operation itself has already committed.
    // A failed audit write must not turn a successful create into a 500.
    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: String(reqUser.id),
          actorRole: reqUser.role,
          action: 'CREATE_DESIGNATION',
          entityType: 'Designation',
          entityId: id,
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'CREATE_DESIGNATION', error: err.message });
    }

    logger.info('Designation created', { designationId: id, name: data.name });

    return { id: String(id), name: data.name, description: data.description, isActive: data.isActive !== undefined ? data.isActive : true };
  }

  static async update(reqUser, designationId, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update designations.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT id, name, description, isActive FROM designations WHERE id = ? LIMIT 1',
      designationId
    );

    if (!existing.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Designation not found.', 404);
    }

    const current = existing[0];
    if (data.name && data.name !== current.name) {
      const duplicate = await prismaClient.$queryRawUnsafe(
        'SELECT id FROM designations WHERE name = ? AND id <> ? LIMIT 1',
        data.name,
        designationId
      );

      if (duplicate.length) {
        throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A designation with this name already exists.', 409);
      }
    }

    const updated = await prismaClient.$queryRawUnsafe(
      'UPDATE designations SET name = ?, description = ?, isActive = ? WHERE id = ?',
      data.name !== undefined ? data.name : current.name,
      data.description !== undefined ? data.description : current.description,
      data.isActive !== undefined ? data.isActive : current.isActive,
      designationId
    );

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: String(reqUser.id),
          actorRole: reqUser.role,
          action: 'UPDATE_DESIGNATION',
          entityType: 'Designation',
          entityId: designationId,
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'UPDATE_DESIGNATION', error: err.message });
    }

    logger.info('Designation updated', { designationId, name: updated });

    return { id: String(designationId), name: data.name !== undefined ? data.name : current.name, description: data.description !== undefined ? data.description : current.description, isActive: data.isActive !== undefined ? data.isActive : current.isActive };
  }

  static async delete(reqUser, designationId) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to delete designations.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT name FROM designations WHERE id = ? LIMIT 1',
      designationId
    );

    if (!existing.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Designation not found.', 404);
    }

    const assigned = await prismaClient.$queryRawUnsafe(
      'SELECT COUNT(*) AS total FROM employees WHERE designation = ? AND isActive = 1',
      existing[0].name
    );

    if (Number(assigned[0]?.total || 0) > 0) {
      throw new AppError(AppErrorCodes.CONFLICT, 'Cannot delete designation with assigned employees. Deactivate it instead.', 409);
    }

    // $executeRawUnsafe takes the parameters individually; passing the array
    // as a single argument makes Prisma treat it as one (array) parameter,
    // which is what produced the 500 on delete.
    await prismaClient.$executeRawUnsafe(
      'DELETE FROM designations WHERE id = ?',
      designationId
    );

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: String(reqUser.id),
          actorRole: reqUser.role,
          action: 'DELETE_DESIGNATION',
          entityType: 'Designation',
          entityId: designationId,
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'DELETE_DESIGNATION', error: err.message });
    }

    logger.info('Designation deleted', { designationId });
    return { message: 'Designation deleted successfully.' };
  }
}

module.exports = { DesignationService };
