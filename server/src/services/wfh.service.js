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

const PAGE_SIZE = 20;

// The live DB has no `employee_profiles` rows — employees live in the
// `employees` table, keyed off users.id. Raw SQL mirrors the comp-off
// module's resolveEmployeeId so WFH and comp-off never disagree about who
// an employee "is".
const resolveEmpSql = 'SELECT id, employeeCode, name FROM employees WHERE userId = ? LIMIT 1';

// Serialize a stored datetime(3) to its IST "YYYY-MM-DD" so the client's
// date rendering (which expects a day key) works.
function istDayKey(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

class WFHService {
  static async resolveEmployee(reqUser) {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(resolveEmpSql, reqUser.id);
    if (!rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }
    const nameParts = String(rows[0].name || '').trim().split(/\s+/);
    return {
      id: Number(rows[0].id),
      employeeCode: rows[0].employeeCode,
      name: rows[0].name,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' '),
    };
  }

  static async create(reqUser, data) {
    const prismaClient = getPrisma();
    const profile = await this.resolveEmployee(reqUser);

    const requestDate = new Date(data.requestDate + 'T00:00:00+05:30'); // parse in IST

    // Validate: WFH may only be requested for FUTURE dates, and at most
    // 3 months in advance.
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    istNow.setHours(0, 0, 0, 0);

    // Future dates only — past days and today are both rejected.
    if (requestDate <= istNow) {
      throw new AppError(
        AppErrorCodes.INVALID_INPUT,
        'WFH can only be requested for a future date (not today or earlier).',
        400
      );
    }

    // ...and at most 3 months in advance.
    const maxAllowed = new Date(istNow);
    maxAllowed.setMonth(maxAllowed.getMonth() + 3);
    if (requestDate > maxAllowed) {
      throw new AppError(
        AppErrorCodes.INVALID_INPUT,
        'WFH can be requested up to 3 months in advance only.',
        400
      );
    }

    // Check for existing active request for the same date
    const existing = await prismaClient.$queryRawUnsafe(
      `SELECT id FROM wfh_requests
       WHERE employeeId = ? AND requestDate = ? AND status IN ('PENDING', 'APPROVED')
       LIMIT 1`,
      profile.id,
      requestDate
    );
    if (existing.length) {
      throw new AppError(AppErrorCodes.CONFLICT, 'A WFH request already exists for this date.', 409);
    }

    await prismaClient.$executeRawUnsafe(
      `INSERT INTO wfh_requests (employeeId, requestDate, reason, status, createdAt, updatedAt)
       VALUES (?, ?, ?, 'PENDING', NOW(3), NOW(3))`,
      profile.id,
      requestDate,
      data.reason
    );

    const inserted = await prismaClient.$queryRawUnsafe(
      'SELECT id, requestDate FROM wfh_requests WHERE employeeId = ? AND requestDate = ? ORDER BY id DESC LIMIT 1',
      profile.id,
      requestDate
    );

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'CREATE_WFH_REQUEST',
        entityType: 'WFHRequest',
        entityId: inserted.length ? String(inserted[0].id) : String(profile.id),
        metadata: JSON.stringify({ employeeId: profile.id, requestDate: istDayKey(requestDate) }),
      },
    });

    logger.info('WFH request created', { employeeId: profile.id, date: istDayKey(requestDate), by: reqUser.id });

    // Notify the reporting manager + HR Admins that a review is needed.
    // Best-effort — a notification failure must not fail the request.
    try {
      const { notifyForApproval } = require('./notify.service');
      await notifyForApproval({
        actorUserId: reqUser.id,
        subject: 'New WFH request',
        details: [
          `Date: ${istDayKey(requestDate)}`,
          `Reason: ${data.reason || '—'}`,
        ],
        reviewPath: '/hr/wfh',
      });
    } catch (notifyErr) {
      logger.warn('WFH approval notice failed', { employeeId: profile.id, error: notifyErr.message });
    }

    return {
      id: inserted.length ? String(inserted[0].id) : '',
      requestDate: istDayKey(requestDate),
      reason: data.reason,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
  }

  static async cancel(reqUser, requestId) {
    const prismaClient = getPrisma();
    const profile = await this.resolveEmployee(reqUser);

    const request = await prismaClient.$queryRawUnsafe(
      'SELECT id, status FROM wfh_requests WHERE id = ? LIMIT 1',
      Number(requestId)
    );
    if (!request.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'WFH request not found.', 404);
    }
    if (Number(request[0].id) !== profile.id) {
      // Re-verify ownership against the full row.
      const full = await prismaClient.$queryRawUnsafe(
        'SELECT employeeId FROM wfh_requests WHERE id = ? LIMIT 1',
        Number(requestId)
      );
      if (Number(full[0].employeeId) !== profile.id) {
        throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only cancel your own requests.', 403);
      }
    }

    const status = String(request[0].status).toUpperCase();
    if (status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Cannot cancel a ${status.toLowerCase()} request.`, 409);
    }

    await prismaClient.$executeRawUnsafe(
      'UPDATE wfh_requests SET status = ?, updatedAt = NOW(3) WHERE id = ?',
      'CANCELLED',
      Number(requestId)
    );

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'CANCEL_WFH_REQUEST',
        entityType: 'WFHRequest',
        entityId: String(requestId),
      },
    });

    logger.info('WFH request cancelled', { requestId, employeeId: profile.id });

    return { id: String(requestId), status: 'CANCELLED' };
  }

  static async listMyRequests(reqUser, { page = 1 }) {
    const prismaClient = getPrisma();
    const profile = await this.resolveEmployee(reqUser);

    const safePage = Math.max(1, Number(page) || 1);
    const skip = (safePage - 1) * PAGE_SIZE;

    const [rows, countRows] = await Promise.all([
      prismaClient.$queryRawUnsafe(
        `SELECT id, requestDate, reason, status, reviewComment, reviewedAt, createdAt
         FROM wfh_requests WHERE employeeId = ?
         ORDER BY requestDate DESC
         LIMIT ? OFFSET ?`,
        profile.id,
        PAGE_SIZE,
        skip
      ),
      prismaClient.$queryRawUnsafe(
        'SELECT CAST(COUNT(*) AS SIGNED) AS total FROM wfh_requests WHERE employeeId = ?',
        profile.id
      ),
    ]);

    const total = Number(countRows[0]?.total || 0);
    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      requests: (rows || []).map((r) => ({
        id: String(r.id),
        requestDate: istDayKey(r.requestDate),
        reason: r.reason,
        status: r.status,
        reviewComment: r.reviewComment || null,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
      })),
      pagination: { page: safePage, pageSize: PAGE_SIZE, total, pages },
    };
  }

  static async listPending(reqUser) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot view pending WFH requests.', 403);
    }

    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT w.id, w.employeeId, w.requestDate, w.reason, w.status, w.createdAt,
              e.employeeCode, e.name AS employeeName, u.email AS employeeEmail
       FROM wfh_requests w
       LEFT JOIN employees e ON e.id = w.employeeId
       LEFT JOIN users u ON u.id = e.userId
       WHERE w.status = 'PENDING'
       ORDER BY w.requestDate ASC`
    );

    return (rows || []).map((r) => ({
      id: String(r.id),
      employeeId: String(r.employeeId),
      employeeName: r.employeeName || '',
      employeeCode: r.employeeCode || '',
      employeeEmail: r.employeeEmail || '',
      requestDate: istDayKey(r.requestDate),
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  static async listAll(reqUser, { page = 1, status }) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot view all WFH requests.', 403);
    }

    const prismaClient = getPrisma();
    const safePage = Math.max(1, Number(page) || 1);
    const skip = (safePage - 1) * PAGE_SIZE;

    const whereParts = [];
    const params = [];
    if (status) {
      whereParts.push('w.status = ?');
      params.push(String(status).toUpperCase());
    }
    const whereClause = whereParts.length ? ' WHERE ' + whereParts.join(' AND ') : '';

    const [rows, countRows] = await Promise.all([
      prismaClient.$queryRawUnsafe(
        `SELECT w.id, w.employeeId, w.requestDate, w.reason, w.status, w.reviewComment, w.reviewedAt, w.createdAt,
                e.employeeCode, e.name AS employeeName, u.email AS employeeEmail
         FROM wfh_requests w
         LEFT JOIN employees e ON e.id = w.employeeId
         LEFT JOIN users u ON u.id = e.userId
         ${whereClause}
         ORDER BY w.requestDate DESC
         LIMIT ? OFFSET ?`,
        ...params,
        PAGE_SIZE,
        skip
      ),
      prismaClient.$queryRawUnsafe(
        `SELECT CAST(COUNT(*) AS SIGNED) AS total FROM wfh_requests w ${whereClause}`,
        ...params
      ),
    ]);

    const total = Number(countRows[0]?.total || 0);
    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      requests: (rows || []).map((r) => ({
        id: String(r.id),
        employeeId: String(r.employeeId),
        employeeName: r.employeeName || '',
        employeeCode: r.employeeCode || '',
        employeeEmail: r.employeeEmail || '',
        requestDate: istDayKey(r.requestDate),
        reason: r.reason,
        status: r.status,
        reviewComment: r.reviewComment || null,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
      })),
      pagination: { page: safePage, pageSize: PAGE_SIZE, total, pages },
    };
  }

  async reviewBase(reqUser, requestId, reviewComment) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review WFH requests.', 403);
    }
    const prismaClient = getPrisma();
    const request = await prismaClient.$queryRawUnsafe(
      'SELECT id, employeeId, status FROM wfh_requests WHERE id = ? LIMIT 1',
      Number(requestId)
    );
    if (!request.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'WFH request not found.', 404);
    }
    const reqRow = request[0];
    const currentStatus = String(reqRow.status).toUpperCase();
    if (currentStatus !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Request is already ${currentStatus.toLowerCase()}.`, 409);
    }

    // HR cannot review their own request.
    const profile = await this.resolveEmployee(reqUser).catch(() => null);
    if (profile && Number(reqRow.employeeId) === profile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot review your own WFH request.', 403);
    }

    return { prismaClient, request: reqRow, reviewComment };
  }

  static async approve(reqUser, requestId, reviewComment) {
    const { prismaClient, request, reviewComment: comment } =
      await WFHService.reviewBase(reqUser, requestId, reviewComment);

    const now = new Date();
    await prismaClient.$executeRawUnsafe(
      `UPDATE wfh_requests
       SET status = 'APPROVED', reviewedBy = ?, reviewedAt = ?, reviewComment = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      Number(reqUser.id),
      now,
      comment || null,
      Number(request.id)
    );

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'APPROVE_WFH_REQUEST',
        entityType: 'WFHRequest',
        entityId: String(request.id),
        metadata: JSON.stringify({ employeeId: Number(request.employeeId), reviewComment: comment || null }),
      },
    });

    logger.info('WFH request approved', { requestId: request.id, reviewerId: reqUser.id });
    return { id: String(request.id), status: 'APPROVED' };
  }

  static async reject(reqUser, requestId, reviewComment) {
    const { prismaClient, request, reviewComment: comment } =
      await WFHService.reviewBase(reqUser, requestId, reviewComment);

    const now = new Date();
    await prismaClient.$executeRawUnsafe(
      `UPDATE wfh_requests
       SET status = 'REJECTED', reviewedBy = ?, reviewedAt = ?, reviewComment = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      Number(reqUser.id),
      now,
      comment || null,
      Number(request.id)
    );

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'REJECT_WFH_REQUEST',
        entityType: 'WFHRequest',
        entityId: String(request.id),
      },
    });

    logger.info('WFH request rejected', { requestId: request.id, reviewerId: reqUser.id });
    return { id: String(request.id), status: 'REJECTED' };
  }
}

module.exports = { WFHService };
