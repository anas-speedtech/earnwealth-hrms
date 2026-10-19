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

class DepartmentService {
  static canManage(reqUser) {
    return reqUser.role === Role.SUPER_ADMIN || reqUser.role === Role.HR_ADMIN;
  }

  static canView(reqUser) {
    return [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role);
  }

  static async list(reqUser) {
    if (!this.canView(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view departments.', 403);
    }

    const prismaClient = getPrisma();
    const departments = await prismaClient.department.findMany({
      orderBy: { name: 'asc' },
    });

    const countRows = await prismaClient.$queryRaw`
      SELECT departmentId, COUNT(*) AS count
      FROM employees
      GROUP BY departmentId
    `;
    const countMap = new Map();
    for (const row of countRows) {
      countMap.set(Number(row.departmentId), Number(row.count));
    }

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      isActive: d.isActive,
      employeeCount: countMap.get(Number(d.id)) || 0,
    }));
  }

  static async getById(reqUser, departmentId) {
    if (!this.canView(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view departments.', 403);
    }

    const prismaClient = getPrisma();
    const deptId = Number(departmentId);
    const dept = await prismaClient.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Department not found.', 404);
    }

    const countRows = await prismaClient.$queryRaw`
      SELECT COUNT(*) AS count
      FROM employees
      WHERE departmentId = ${deptId}
    `;
    const employeeCount = countRows && countRows[0] ? Number(countRows[0].count) : 0;

    return {
      id: dept.id,
      name: dept.name,
      description: dept.description,
      isActive: dept.isActive,
      employeeCount,
    };
  }

  static async create(reqUser, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create departments.', 403);
    }

    const prismaClient = getPrisma();

    const existing = await prismaClient.department.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A department with this name already exists.', 409);
    }

    const dept = await prismaClient.department.create({
      data: {
        name: data.name,
        description: data.description,
      },
    });

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'CREATE_DEPARTMENT',
          entityType: 'Department',
          entityId: dept.id,
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'CREATE_DEPARTMENT', error: err.message });
    }

    logger.info('Department created', { departmentId: dept.id, name: dept.name });

    return { id: dept.id, name: dept.name, description: dept.description, isActive: dept.isActive };
  }

  static async update(reqUser, departmentId, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update departments.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.department.findUnique({
      where: { id: Number(departmentId) },
    });

    if (!existing) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Department not found.', 404);
    }

    // Check duplicate name (excluding current record)
    if (data.name && data.name !== existing.name) {
      const duplicate = await prismaClient.department.findFirst({
        where: { name: data.name, id: { not: departmentId } },
      });
      if (duplicate) {
        throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A department with this name already exists.', 409);
      }
    }

    const updated = await prismaClient.department.update({
      where: { id: Number(departmentId) },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      },
    });

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'UPDATE_DEPARTMENT',
          entityType: 'Department',
          entityId: departmentId,
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'UPDATE_DEPARTMENT', error: err.message });
    }

    logger.info('Department updated', { departmentId, name: updated.name });

    return { id: updated.id, name: updated.name, description: updated.description, isActive: updated.isActive };
  }

  static async delete(reqUser, departmentId) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to delete departments.', 403);
    }

    const prismaClient = getPrisma();
    const deptId = Number(departmentId);
    const dept = await prismaClient.department.findUnique({
      where: { id: deptId },
    });

    if (!dept) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Department not found.', 404);
    }

    const countRows = await prismaClient.$queryRaw`
      SELECT COUNT(*) AS count
      FROM employees
      WHERE departmentId = ${deptId}
    `;
    const employeeCount = countRows && countRows[0] ? Number(countRows[0].count) : 0;

    if (employeeCount > 0) {
      throw new AppError(AppErrorCodes.CONFLICT, 'Cannot delete department with assigned employees. Deactivate it instead.', 409);
    }

    await prismaClient.department.delete({ where: { id: Number(departmentId) } });

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'DELETE_DEPARTMENT',
          entityType: 'Department',
          entityId: departmentId,
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'DELETE_DEPARTMENT', error: err.message });
    }

    logger.info('Department deleted', { departmentId });
    return { message: 'Department deleted successfully.' };
  }
}

module.exports = { DepartmentService };
