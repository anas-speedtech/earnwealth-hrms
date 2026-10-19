const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

let prismaInstance;

function getPrisma() {
  if (!prismaInstance) {
    const { PrismaClient } = require('@prisma/client');
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

class WFHService {
  static async resolveEmployee(reqUser) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });

    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }
    return profile;
  }

  static async create(reqUser, data) {
    const prismaClient = getPrisma();
    const profile = await this.resolveEmployee(reqUser);

    const requestDate = new Date(data.requestDate + 'T00:00:00+05:30'); // parse in IST

    // Validate: cannot request for past workdays
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    istNow.setHours(0, 0, 0, 0);

    if (requestDate < istNow) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Cannot request WFH for a past workday.', 400);
    }

    // Check for existing active request for the same date
    const existing = await prismaClient.wFHRequest.findFirst({
      where: {
        employeeId: profile.id,
        requestDate,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    if (existing) {
      throw new AppError(AppErrorCodes.CONFLICT, 'A WFH request already exists for this date.', 409);
    }

    const request = await prismaClient.wFHRequest.create({
      data: {
        employeeId: profile.id,
        requestDate,
        reason: data.reason,
        status: 'PENDING',
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'CREATE_WFH_REQUEST',
        entityType: 'WFHRequest',
        entityId: request.id,
      },
    });

    logger.info('WFH request created', { requestId: request.id, employeeId: profile.id, date: requestDate });

    return {
      id: request.id,
      requestDate: request.requestDate,
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt,
    };
  }

  static async cancel(reqUser, requestId) {
    const prismaClient = getPrisma();
    const profile = await this.resolveEmployee(reqUser);

    const request = await prismaClient.wFHRequest.findUnique({
      where: { id: Number(requestId) },
    });

    if (!request) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'WFH request not found.', 404);
    }

    if (request.employeeId !== profile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only cancel your own requests.', 403);
    }

    if (request.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Cannot cancel a ${request.status.toLowerCase()} request.`, 409);
    }

    const updated = await prismaClient.wFHRequest.update({
      where: { id: Number(requestId) },
      data: { status: 'CANCELLED' },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'CANCEL_WFH_REQUEST',
        entityType: 'WFHRequest',
        entityId: requestId,
      },
    });

    logger.info('WFH request cancelled', { requestId, employeeId: profile.id });

    return updated;
  }

  static async listMyRequests(reqUser, { page = 1 }) {
    const prismaClient = getPrisma();
    const profile = await this.resolveEmployee(reqUser);

    const skip = (page - 1) * PAGE_SIZE;

    const [requests, total] = await Promise.all([
      prismaClient.wFHRequest.findMany({
        where: { employeeId: profile.id },
        orderBy: { requestDate: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      prismaClient.wFHRequest.count({ where: { employeeId: profile.id } }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      requests,
      pagination: { page, pageSize: PAGE_SIZE, total, pages },
    };
  }

  static async listPending(reqUser) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review WFH requests.', 403);
    }

    const prismaClient = getPrisma();

    const requests = await prismaClient.wFHRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { requestDate: 'asc' },
      include: {
        employee: {
          include: { user: { select: { email: true } } },
        },
      },
    });

    return requests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      employeeCode: r.employee.employeeCode,
      employeeEmail: r.employee.user.email,
      requestDate: r.requestDate,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  static async listAll(reqUser, { page = 1, status }) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view WFH requests.', 403);
    }

    const prismaClient = getPrisma();
    const where = {};

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * PAGE_SIZE;

    const [requests, total] = await Promise.all([
      prismaClient.wFHRequest.findMany({
        where,
        orderBy: { requestDate: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: {
          employee: {
            include: { user: { select: { email: true } } },
          },
        },
      }),
      prismaClient.wFHRequest.count({ where }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      requests: requests.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
        employeeCode: r.employee.employeeCode,
        employeeEmail: r.employee.user.email,
        requestDate: r.requestDate,
        reason: r.reason,
        status: r.status,
        reviewComment: r.reviewComment,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
      })),
      pagination: { page, pageSize: PAGE_SIZE, total, pages },
    };
  }

  static async approve(reqUser, requestId, reviewComment) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to approve WFH requests.', 403);
    }

    const prismaClient = getPrisma();

    const request = await prismaClient.wFHRequest.findUnique({
      where: { id: Number(requestId) },
    });

    if (!request) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'WFH request not found.', 404);
    }

    if (request.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Request is already ${request.status.toLowerCase()}.`, 409);
    }

    // Employees cannot approve their own requests
    const profile = await this.resolveEmployee(reqUser);
    if (request.employeeId === profile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot approve your own WFH request.', 403);
    }

    const now = new Date();

    const updated = await prismaClient.$transaction(async (tx) => {
      const wfh = await tx.wFHRequest.update({
        where: { id: Number(requestId) },
        data: {
          status: 'APPROVED',
          reviewedBy: reqUser.id,
          reviewedAt: now,
          reviewComment,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'APPROVE_WFH_REQUEST',
          entityType: 'WFHRequest',
          entityId: requestId,
          metadata: JSON.stringify({ employeeId: request.employeeId, requestDate: request.requestDate }),
        },
      });

      logger.info('WFH request approved', { requestId, reviewerId: reqUser.id });

      return wfh;
    });

    return updated;
  }

  static async reject(reqUser, requestId, reviewComment) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to reject WFH requests.', 403);
    }

    const prismaClient = getPrisma();

    const request = await prismaClient.wFHRequest.findUnique({
      where: { id: Number(requestId) },
    });

    if (!request) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'WFH request not found.', 404);
    }

    if (request.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Request is already ${request.status.toLowerCase()}.`, 409);
    }

    // Employees cannot reject their own requests
    const profile = await this.resolveEmployee(reqUser);
    if (request.employeeId === profile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot reject your own WFH request.', 403);
    }

    const now = new Date();

    const updated = await prismaClient.wFHRequest.update({
      where: { id: Number(requestId) },
      data: {
        status: 'REJECTED',
        reviewedBy: reqUser.id,
        reviewedAt: now,
        reviewComment,
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'REJECT_WFH_REQUEST',
        entityType: 'WFHRequest',
        entityId: requestId,
      },
    });

    logger.info('WFH request rejected', { requestId, reviewerId: reqUser.id });

    return updated;
  }
}

const PAGE_SIZE = 20;

module.exports = { WFHService };
