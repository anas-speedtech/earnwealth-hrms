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

class DesignationService {
  static canManage(reqUser) {
    return reqUser.role === Role.SUPER_ADMIN || reqUser.role === Role.ADMIN;
  }

  static canView(reqUser) {
    return [Role.SUPER_ADMIN, Role.ADMIN, Role.HR].includes(reqUser.role);
  }

  static async list(reqUser) {
    if (!this.canView(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view designations.', 403);
    }

    const prismaClient = getPrisma();
    const designations = await prismaClient.designation.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { employees: true } },
      },
    });

    return designations.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      isActive: d.isActive,
      employeeCount: d._count.employees,
    }));
  }

  static async getById(reqUser, designationId) {
    if (!this.canView(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view designations.', 403);
    }

    const prismaClient = getPrisma();
    const desig = await prismaClient.designation.findUnique({
      where: { id: designationId },
      include: {
        _count: { select: { employees: true } },
      },
    });

    if (!desig) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Designation not found.', 404);
    }

    return {
      id: desig.id,
      name: desig.name,
      description: desig.description,
      isActive: desig.isActive,
      employeeCount: desig._count.employees,
    };
  }

  static async create(reqUser, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create designations.', 403);
    }

    const prismaClient = getPrisma();

    const existing = await prismaClient.designation.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A designation with this name already exists.', 409);
    }

    const desig = await prismaClient.designation.create({
      data: {
        name: data.name,
        description: data.description,
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'CREATE_DESIGNATION',
        entityType: 'Designation',
        entityId: desig.id,
      },
    });

    logger.info('Designation created', { designationId: desig.id, name: desig.name });

    return { id: desig.id, name: desig.name, description: desig.description, isActive: desig.isActive };
  }

  static async update(reqUser, designationId, data) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update designations.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.designation.findUnique({ where: { id: designationId } });

    if (!existing) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Designation not found.', 404);
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await prismaClient.designation.findFirst({
        where: { name: data.name, id: { not: designationId } },
      });
      if (duplicate) {
        throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'A designation with this name already exists.', 409);
      }
    }

    const updated = await prismaClient.designation.update({
      where: { id: designationId },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'UPDATE_DESIGNATION',
        entityType: 'Designation',
        entityId: designationId,
      },
    });

    logger.info('Designation updated', { designationId, name: updated.name });

    return { id: updated.id, name: updated.name, description: updated.description, isActive: updated.isActive };
  }

  static async delete(reqUser, designationId) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to delete designations.', 403);
    }

    const prismaClient = getPrisma();
    const desig = await prismaClient.designation.findUnique({
      where: { id: designationId },
      include: { _count: { select: { employees: true } } },
    });

    if (!desig) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Designation not found.', 404);
    }

    if (desig._count.employees > 0) {
      throw new AppError(AppErrorCodes.CONFLICT, 'Cannot delete designation with assigned employees. Deactivate it instead.', 409);
    }

    await prismaClient.designation.delete({ where: { id: designationId } });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'DELETE_DESIGNATION',
        entityType: 'Designation',
        entityId: designationId,
      },
    });

    logger.info('Designation deleted', { designationId });
    return { message: 'Designation deleted successfully.' };
  }
}

module.exports = { DesignationService };
