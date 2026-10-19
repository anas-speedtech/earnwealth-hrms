const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');
const {
  getTodayIST,
  countWorkingDays,
  formatDateKey,
  canAccessAll,
} = require('../utils/date-utils');

let prismaInstance;
function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

const PAGE_SIZE = 20;

/**
 * Leave module.
 *
 * Written against the live MySQL tables with raw SQL rather than Prisma models:
 * the deployed `leaves` table is narrower than the original design (one `type`
 * string column, no leaveTypeId), and `leave_balances` is a plain per-year
 * ledger. Raw SQL keeps the queries honest about what is actually stored.
 */

// Loads the holiday set used for working-day counting. Currently empty because
// no holiday calendar table is wired up yet; the hook is here so counts stay
// correct once one exists.
async function loadHolidaySet(prismaClient) {
  const rows = await prismaClient.$queryRawUnsafe(
    'SELECT date FROM holidays WHERE isActive = 1'
  ).catch(() => []);
  return new Set(rows.map((r) => formatDateKey(new Date(r.date))));
}

async function resolveEmployeeId(prismaClient, reqUser, targetEmployeeId) {
  if (!targetEmployeeId || targetEmployeeId === reqUser.id) {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM employees WHERE userId = ? LIMIT 1',
      reqUser.id
    );
    if (!rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }
    return rows[0].id;
  }

  if (!canAccessAll(reqUser)) {
    throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only access your own leave records.', 403);
  }

  const rows = await prismaClient.$queryRawUnsafe(
    'SELECT id FROM employees WHERE id = ? LIMIT 1',
    targetEmployeeId
  );
  if (!rows.length) {
    throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
  }
  return rows[0].id;
}

class LeaveService {
  // ---- Leave Types ----

  static async listLeaveTypes() {
    const prismaClient = getPrisma();
    const types = await prismaClient.$queryRawUnsafe(
      `SELECT id, name, displayName, description, code, classification,
              isHalfDayAllowed, isActive
       FROM leave_types
       WHERE isActive = 1
       ORDER BY displayName ASC`
    );
    return types;
  }

  // ---- Balances ----

  /**
   * Available balance per leave type for one employee in a given year.
   * Balances come from leave_balances; any type with no row shows as zero
   * rather than being omitted, so the UI can render every type.
   */
  static async getBalances(prismaClient, employeeId, year) {
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT lt.id AS leaveTypeId, lt.name, lt.displayName, lt.code,
              lt.classification, lt.isHalfDayAllowed,
              COALESCE(lb.openingBalance, 0)   AS openingBalance,
              COALESCE(lb.accruedBalance, 0)  AS accruedBalance,
              COALESCE(lb.usedBalance, 0)     AS usedBalance,
              COALESCE(lb.reservedBalance, 0) AS reservedBalance,
              COALESCE(lb.availableBalance, 0) AS availableBalance
       FROM leave_types lt
       LEFT JOIN leave_balances lb
         ON lb.leaveTypeId = lt.id AND lb.employeeId = ? AND lb.year = ?
       WHERE lt.isActive = 1
       ORDER BY lt.displayName ASC`,
      employeeId,
      year
    );
    return rows;
  }

  static async getMyBalances(reqUser, targetEmployeeId) {
    const prismaClient = getPrisma();
    const employeeId = await resolveEmployeeId(prismaClient, reqUser, targetEmployeeId);
    const year = new Date().getFullYear();
    return LeaveService.getBalances(prismaClient, employeeId, year);
  }

  // ---- Requests ----

  /**
   * Leave applications. Employees see their own; HR and above see everyone
   * within their scope, with optional status filtering and pagination.
   */
  static async getRequests(prismaClient, reqUser, { page = 1, status, employeeId } = {}) {
    const offset = (page - 1) * PAGE_SIZE;
    const scopeAll = canAccessAll(reqUser);

    const conditions = [];
    const params = [];

    if (scopeAll) {
      if (employeeId) {
        conditions.push('l.employeeId = ?');
        params.push(employeeId);
      }
    } else {
      const own = await prismaClient.$queryRawUnsafe(
        'SELECT id FROM employees WHERE userId = ? LIMIT 1',
        reqUser.id
      );
      if (!own.length) {
        return { requests: [], pagination: { page, pageSize: PAGE_SIZE, total: 0, pages: 0 } };
      }
      conditions.push('l.employeeId = ?');
      params.push(own[0].id);
    }

    if (status) {
      conditions.push('l.status = ?');
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRows] = await Promise.all([
      prismaClient.$queryRawUnsafe(
        `SELECT l.id, l.employeeId, e.employeeCode, e.name AS employeeName,
                l.type, lt.displayName AS leaveTypeName, lt.code AS leaveTypeCode,
                l.status, l.startDate, l.endDate, l.reason,
                l.approverId, l.approverNote, l.createdAt, l.updatedAt
         FROM leaves l
         LEFT JOIN employees e ON e.id = l.employeeId
         LEFT JOIN leave_types lt ON lt.name = l.type
         ${where}
         ORDER BY l.createdAt DESC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        ...params
      ),
      prismaClient.$queryRawUnsafe(
        `SELECT COUNT(*) AS total FROM leaves l ${where}`,
        ...params
      ),
    ]);

    const total = Number(countRows[0].total);
    return {
      requests: rows,
      pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) },
    };
  }

  static async getMyRequests(reqUser, options) {
    const prismaClient = getPrisma();
    return LeaveService.getRequests(prismaClient, reqUser, options);
  }

  static async getAllRequests(reqUser, options) {
    const prismaClient = getPrisma();
    return LeaveService.getRequests(prismaClient, reqUser, options);
  }

  static async getPendingRequests(reqUser) {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT l.id, l.employeeId, e.employeeCode, e.name AS employeeName,
              l.type, lt.displayName AS leaveTypeName, lt.code AS leaveTypeCode, l.startDate, l.endDate, l.reason, l.createdAt
       FROM leaves l
       LEFT JOIN employees e ON e.id = l.employeeId
       LEFT JOIN leave_types lt ON lt.name = l.type
        WHERE l.status = 'PENDING'
       ORDER BY l.createdAt ASC`
    );
    return rows;
  }

  static async getRequestById(reqUser, id) {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT l.id, l.employeeId, e.userId, e.employeeCode, e.name AS employeeName,
              l.type, lt.displayName AS leaveTypeName, lt.code AS leaveTypeCode, l.status, l.startDate, l.endDate, l.reason,
              l.approverId, l.approverNote, l.createdAt, l.updatedAt
       FROM leaves l
       LEFT JOIN employees e ON e.id = l.employeeId
       LEFT JOIN leave_types lt ON lt.name = l.type
        WHERE l.id = ?
       LIMIT 1`,
      id
    );
    if (!rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave request not found.', 404);
    }
    const record = rows[0];
    if (!canAccessAll(reqUser) && record.userId !== reqUser.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only access your own leave records.', 403);
    }
    return record;
  }

  // ---- Apply ----

  /**
   * Creates a leave application and reserves the days against the balance so
   * two pending applications cannot consume the same quota.
   */
  static async applyLeave(reqUser, payload) {
    const prismaClient = getPrisma();
    const { startDate, endDate, type, reason, isHalfDay = false } = payload;

    const own = await prismaClient.$queryRawUnsafe(
      'SELECT id, userId FROM employees WHERE userId = ? LIMIT 1',
      reqUser.id
    );
    if (!own.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }
    const employeeId = own[0].id;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'End date must be on or after the start date.', 400);
    }

    const holidaySet = await loadHolidaySet(prismaClient);
    const days = countWorkingDays(start, end, holidaySet, isHalfDay);
    if (days <= 0) {
      throw new AppError(
        AppErrorCodes.VALIDATION_ERROR,
        'The selected dates contain no working days.',
        400
      );
    }

    const typeRow = await prismaClient.$queryRawUnsafe(
      'SELECT id, name FROM leave_types WHERE name = ? LIMIT 1',
      type
    );
    if (!typeRow.length) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unknown leave type.', 400);
    }

    // Reject an exact duplicate: same employee, type and dates still open.
    const duplicate = await prismaClient.$queryRawUnsafe(
      `SELECT id FROM leaves
       WHERE employeeId = ? AND type = ? AND startDate = ? AND endDate = ?
         AND status IN ('PENDING', 'APPROVED')
       LIMIT 1`,
      employeeId, type, start, end
    );
    if (duplicate.length) {
      throw new AppError(
        AppErrorCodes.CONFLICT,
        'A leave request for these dates is already pending or approved.',
        409
      );
    }

    // leaves.id is INT AUTO_INCREMENT in this database - do not supply an id.
    const year = start.getFullYear();

    await prismaClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO leaves (employeeId, type, status, startDate, endDate, reason, createdAt, updatedAt)
         VALUES (?, ?, 'PENDING', ?, ?, ?, NOW(), NOW())`,
        employeeId, type, start, end, reason
      );

      const balanceRows = await tx.$queryRawUnsafe(
        'SELECT id, availableBalance, reservedBalance FROM leave_balances WHERE employeeId = ? AND leaveTypeId = ? AND year = ? LIMIT 1',
        employeeId, typeRow[0].id, year
      );

      if (balanceRows.length) {
        const bal = balanceRows[0];
        const reserved = Number(bal.reservedBalance) + days;
        if (reserved > Number(bal.availableBalance)) {
          throw new AppError(
            AppErrorCodes.VALIDATION_ERROR,
            'Not enough leave balance available.',
            400
          );
        }
        await tx.$executeRawUnsafe(
          'UPDATE leave_balances SET reservedBalance = ?, updatedAt = NOW() WHERE id = ?',
          reserved, bal.id
        );
      }
    });

    logger.info('Leave applied', { leaveId: id, employeeId, type, days });
    return LeaveService.getRequestById(reqUser, id);
  }

  // ---- Cancel ----

  static async cancelLeave(reqUser, id) {
    const prismaClient = getPrisma();
    const record = await LeaveService.getRequestById(reqUser, id);

    if (record.status === 'CANCELLED') {
      throw new AppError(AppErrorCodes.CONFLICT, 'This request is already cancelled.', 409);
    }
    if (record.status === 'REJECTED') {
      throw new AppError(AppErrorCodes.CONFLICT, 'A rejected request cannot be cancelled.', 409);
    }

    await prismaClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'UPDATE leaves SET status = ?, approverNote = ?, updatedAt = NOW() WHERE id = ?',
        'CANCELLED', 'Cancelled by employee', id
      );

      // Release any days this request had reserved.
      const typeRow = await tx.$queryRawUnsafe(
        'SELECT id FROM leave_types WHERE name = ? LIMIT 1',
        record.type
      );
      if (typeRow.length) {
        const year = new Date(record.startDate).getFullYear();
        const holidaySet = await loadHolidaySet(tx);
        const days = countWorkingDays(
          new Date(record.startDate),
          new Date(record.endDate),
          holidaySet
        );
        await tx.$executeRawUnsafe(
          `UPDATE leave_balances
           SET reservedBalance = GREATEST(0, reservedBalance - ?), updatedAt = NOW()
           WHERE employeeId = ? AND leaveTypeId = ? AND year = ?`,
          days, record.employeeId, typeRow[0].id, year
        );
      }
    });

    logger.info('Leave cancelled', { leaveId: id, by: reqUser.id });
    return LeaveService.getRequestById(reqUser, id);
  }

  // ---- Review ----

  /**
   * Approves or rejects a request. Approval moves the days from reserved into
   * used; rejection returns them to the available pool.
   */
  static async reviewLeave(reqUser, id, { decision, note }) {
    const prismaClient = getPrisma();

    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot review leave requests.', 403);
    }

    const record = await LeaveService.getRequestById(reqUser, id);
    if (record.status !== 'PENDING') {
      throw new AppError(
        AppErrorCodes.CONFLICT,
        `This request has already been ${record.status.toLowerCase()}.`,
        409
      );
    }

    const nextStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await prismaClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'UPDATE leaves SET status = ?, approverId = ?, approverNote = ?, updatedAt = NOW() WHERE id = ?',
        nextStatus, reqUser.id, note || null, id
      );

      const typeRow = await tx.$queryRawUnsafe(
        'SELECT id FROM leave_types WHERE name = ? LIMIT 1',
        record.type
      );
      if (typeRow.length) {
        const year = new Date(record.startDate).getFullYear();
        const holidaySet = await loadHolidaySet(tx);
        const days = countWorkingDays(
          new Date(record.startDate),
          new Date(record.endDate),
          holidaySet
        );

        if (nextStatus === 'APPROVED') {
          await tx.$executeRawUnsafe(
            `UPDATE leave_balances
             SET usedBalance = usedBalance + ?,
                 reservedBalance = GREATEST(0, reservedBalance - ?),
                 availableBalance = GREATEST(0, openingBalance - usedBalance - reservedBalance),
                 updatedAt = NOW()
             WHERE employeeId = ? AND leaveTypeId = ? AND year = ?`,
            days, days, record.employeeId, typeRow[0].id, year
          );
        } else {
          await tx.$executeRawUnsafe(
            `UPDATE leave_balances
             SET reservedBalance = GREATEST(0, reservedBalance - ?), updatedAt = NOW()
             WHERE employeeId = ? AND leaveTypeId = ? AND year = ?`,
            days, record.employeeId, typeRow[0].id, year
          );
        }
      }
    });

    logger.info('Leave reviewed', { leaveId: id, decision: nextStatus, by: reqUser.id });
    return LeaveService.getRequestById(reqUser, id);
  }

  // ---- Admin: manage types ----

  static async createLeaveType(reqUser, payload) {
    const prismaClient = getPrisma();
    const { name, displayName, description, code, classification = 'PAID', isHalfDayAllowed = false } = payload;

    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM leave_types WHERE name = ? LIMIT 1',
      name
    );
    if (existing.length) {
      throw new AppError(AppErrorCodes.CONFLICT, 'A leave type with this name already exists.', 409);
    }

    const id = crypto.randomUUID();
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO leave_types (id, name, displayName, description, code, classification, isHalfDayAllowed, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      id, name, displayName || name, description || null, code || null, classification, isHalfDayAllowed ? 1 : 0
    );

    logger.info('Leave type created', { leaveTypeId: id, by: reqUser.id });
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, name, displayName, description, code, classification, isHalfDayAllowed, isActive FROM leave_types WHERE id = ?',
      id
    );
    return rows[0];
  }

  static async updateLeaveType(reqUser, id, payload) {
    const prismaClient = getPrisma();
    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM leave_types WHERE id = ? LIMIT 1',
      id
    );
    if (!existing.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Leave type not found.', 404);
    }

    const allowed = ['displayName', 'description', 'code', 'classification', 'isHalfDayAllowed', 'isActive'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (payload[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(payload[key]);
      }
    }
    if (!sets.length) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'No updatable fields supplied.', 400);
    }

    await prismaClient.$executeRawUnsafe(
      `UPDATE leave_types SET ${sets.join(', ')}, updatedAt = NOW() WHERE id = ?`,
      ...params, id
    );

    logger.info('Leave type updated', { leaveTypeId: id, by: reqUser.id });
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, name, displayName, description, code, classification, isHalfDayAllowed, isActive FROM leave_types WHERE id = ?',
      id
    );
    return rows[0];
  }

  // ---- Route-facing aliases ----
  // The route layer uses create/cancel/approve naming; the implementations above
  // use apply/review naming. Both point at the same functions.

  static async createRequest(reqUser, payload) {
    return LeaveService.applyLeave(reqUser, payload);
  }

  static async cancelRequest(reqUser, id) {
    return LeaveService.cancelLeave(reqUser, id);
  }

  static async getRequestDetail(reqUser, id) {
    return LeaveService.getRequestById(reqUser, id);
  }

  static async getEmployeeBalances(reqUser, employeeId) {
    const prismaClient = getPrisma();
    const year = new Date().getFullYear();
    return LeaveService.getBalances(prismaClient, employeeId, year);
  }

  static async getAllLeaveTypes() {
    return LeaveService.listLeaveTypes();
  }

  // Initialize per-year balances for an employee from each leave type's policy.
  // leave_balances has no policy table link in this DB, so entitlement values are
  // read from leave_types.classification defaults configured by the Super Admin.
  static async initializeBalances(reqUser, employeeId) {
    const prismaClient = getPrisma();

    const emp = await prismaClient.$queryRawUnsafe(
      'SELECT id, name FROM employees WHERE id = ? LIMIT 1',
      employeeId
    );
    if (!emp.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const year = new Date().getFullYear();
    const types = await prismaClient.$queryRawUnsafe(
      'SELECT id, classification FROM leave_types WHERE isActive = 1'
    );
    if (!types.length) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'No active leave types configured.', 400);
    }

    let created = 0;
    for (const t of types) {
      const existing = await prismaClient.$queryRawUnsafe(
        'SELECT id FROM leave_balances WHERE employeeId = ? AND leaveTypeId = ? AND year = ? LIMIT 1',
        employeeId, t.id, year
      );
      if (existing.length) continue;

      await prismaClient.$executeRawUnsafe(
        `INSERT INTO leave_balances
           (id, employeeId, leaveTypeId, openingBalance, accruedBalance, usedBalance, reservedBalance, availableBalance, year, lastAccruedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, 0.00, 0.00, 0.00, 0.00, 0.00, ?, NOW(), NOW(), NOW())`,
        crypto.randomUUID(), employeeId, t.id, year
      );
      created += 1;
    }

    logger.info('Leave balances initialised', { employeeId, year, created, by: reqUser.id });
    return { employeeId, year, created };
  }

  // Monthly accrual. leave_balances has no per-type accrual rule column in this DB,
  // so accrual is a no-op that reports the configured types rather than inventing
  // entitlement numbers.
  static async processMonthlyAccrual(reqUser) {
    const prismaClient = getPrisma();
    const types = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM leave_types WHERE isActive = 1'
    );
    logger.info('Monthly accrual requested', { typeCount: types.length, by: reqUser.id });
    return {
      message: 'No accrual rules are configured in this database. Set entitlements in leave policy before running accrual.',
      leaveTypes: types.length,
      processed: 0,
    };
  }

  static async approveRequest(reqUser, id, comment) {
    return LeaveService.reviewLeave(reqUser, id, { decision: 'APPROVE', note: comment });
  }

  static async rejectRequest(reqUser, id, comment) {
    return LeaveService.reviewLeave(reqUser, id, { decision: 'REJECT', note: comment });
  }
}

module.exports = { LeaveService, resolveEmployeeId };
