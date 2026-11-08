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
              isHalfDayAllowed, isActive,
              annualEntitlementDays, isUnlimited, appliesToBoardLevel
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
              lt.classification, lt.isHalfDayAllowed, lt.isUnlimited, lt.appliesToBoardLevel,
              COALESCE(lb.openingBalance, 0)   AS openingBalance,
              COALESCE(lb.accruedBalance, 0)  AS accruedBalance,
              COALESCE(lb.usedBalance, 0)     AS usedBalance,
              COALESCE(lb.reservedBalance, 0) AS reservedBalance,
              COALESCE(lb.availableBalance, 0) AS availableBalance,
              CASE WHEN lb.id IS NOT NULL THEN 1 ELSE 0 END AS hasBalance,
              EXISTS(
                SELECT 1 FROM leave_balances lb_any
                WHERE lb_any.employeeId = ? AND lb_any.leaveTypeId = lt.id
              ) AS configured
       FROM leave_types lt
       LEFT JOIN leave_balances lb
         ON lb.leaveTypeId = lt.id AND lb.employeeId = ? AND lb.year = ?
       WHERE lt.isActive = 1
       ORDER BY lt.displayName ASC`,
      employeeId,
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

  /**
   * Leave-type tiles for the HR broad view. For the selected month (and, if a
   * specific day is chosen, that day) it returns per-type counts plus the
   * requests that back each tile so the UI can drill in. Counts are based on
   * requests that overlap the period, which is what matters for planning.
   */
  static async getTiles(reqUser, { year, month, day }) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view leave tiles.', 403);
    }
    const prismaClient = getPrisma();

    const yearNum = Number(year) || new Date().getFullYear();
    const monthNum = Number(month) || new Date().getMonth() + 1;
    const dayNum = Number(day) || 0;

    // Build the period window in UTC so it matches how the live DB stores
    // dates (the app has historically written local IST as UTC).
    let periodStart, periodEnd;
    if (dayNum > 0) {
      periodStart = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
      periodEnd = new Date(Date.UTC(yearNum, monthNum - 1, dayNum + 1));
    } else {
      periodStart = new Date(Date.UTC(yearNum, monthNum - 1, 1));
      periodEnd = new Date(Date.UTC(yearNum, monthNum, 1));
    }

    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT l.id, l.employeeId, e.employeeCode, e.name AS employeeName,
              l.type, COALESCE(lt.displayName, l.type) AS leaveTypeName, lt.code AS leaveTypeCode,
              l.status, l.startDate, l.endDate, l.reason
       FROM leaves l
       LEFT JOIN employees e ON e.id = l.employeeId
       LEFT JOIN leave_types lt ON BINARY lt.name = BINARY l.type
       WHERE l.endDate >= ? AND l.startDate < ?
       ORDER BY l.startDate ASC`,
      periodStart,
      periodEnd
    );

    const byType = new Map();
    for (const row of rows) {
      const key = row.leaveTypeCode || row.type || 'OTHER';
      if (!byType.has(key)) {
        byType.set(key, {
          key,
          code: key,
          name: row.leaveTypeName || row.type || 'Other',
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          requests: [],
        });
      }
      const tile = byType.get(key);
      tile.total++;
      if (row.status === 'PENDING') tile.pending++;
      else if (row.status === 'APPROVED') tile.approved++;
      else if (row.status === 'REJECTED') tile.rejected++;
      tile.requests.push(row);
    }

    return {
      year: yearNum,
      month: monthNum,
      day: dayNum || null,
      tiles: Array.from(byType.values()),
    };
  }

  static async getPendingRequests(reqUser) {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT l.id, l.employeeId, e.employeeCode, e.name AS employeeName,
              l.type, lt.displayName AS leaveTypeName, lt.code AS leaveTypeCode, l.startDate, l.endDate, l.reason, l.createdAt
       FROM leaves l
       LEFT JOIN employees e ON e.id = l.employeeId
       LEFT JOIN leave_types lt ON BINARY lt.name = BINARY l.type
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
    // The client sends the leave type's uuid as `leaveTypeId`; the `leaves.type`
    // column stores the type's NAME, so resolve the type row first.
    const { startDate, endDate, leaveTypeId, reason, isHalfDay = false } = payload;

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
      'SELECT id, name FROM leave_types WHERE id = ? AND isActive = 1 LIMIT 1',
      leaveTypeId
    );
    if (!typeRow.length) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unknown leave type.', 400);
    }
    const typeName = typeRow[0].name;

    // Employees may only apply for leave types that are configured for them
    // (a leave_balances row exists for this employee + type, in any year).
    // The Apply Leave screen hides the rest, this closes the backend gap.
    const configuredRows = await prismaClient.$queryRawUnsafe(
      'SELECT 1 FROM leave_balances WHERE employeeId = ? AND leaveTypeId = ? LIMIT 1',
      employeeId, typeRow[0].id
    );
    if (!configuredRows.length) {
      throw new AppError(
        AppErrorCodes.VALIDATION_ERROR,
        'This leave type is not configured for your account.',
        400
      );
    }

    // Reject an exact duplicate: same employee, type and dates still open.
    const duplicate = await prismaClient.$queryRawUnsafe(
      `SELECT id FROM leaves
       WHERE employeeId = ? AND type = ? AND startDate = ? AND endDate = ?
         AND status IN ('PENDING', 'APPROVED')
       LIMIT 1`,
      employeeId, typeName, start, end
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

    let newLeaveId = null;
    await prismaClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO leaves (employeeId, type, status, startDate, endDate, reason, createdAt, updatedAt)
         VALUES (?, ?, 'PENDING', ?, ?, ?, NOW(), NOW())`,
        employeeId, typeName, start, end, reason
      );
      const inserted = await tx.$queryRawUnsafe('SELECT LAST_INSERT_ID() AS id');
      newLeaveId = Number(inserted[0].id);

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

    logger.info('Leave applied', { leaveId: newLeaveId, employeeId, type: typeName, days });
    return LeaveService.getRequestById(reqUser, newLeaveId);
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
    const {
      name, displayName, description, code, classification = 'PAID', isHalfDayAllowed = false,
      annualEntitlementDays = 0, isUnlimited = false, appliesToBoardLevel = false,
    } = payload;

    const existing = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM leave_types WHERE name = ? LIMIT 1',
      name
    );
    if (existing.length) {
      throw new AppError(AppErrorCodes.CONFLICT, 'A leave type with this name already exists.', 409);
    }

    const id = crypto.randomUUID();
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO leave_types
         (id, name, displayName, description, code, classification, isHalfDayAllowed,
          annualEntitlementDays, isUnlimited, appliesToBoardLevel, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      id, name, displayName || name, description || null, code || null, classification,
      isHalfDayAllowed ? 1 : 0,
      Number(annualEntitlementDays) || 0,
      isUnlimited ? 1 : 0,
      appliesToBoardLevel ? 1 : 0
    );

    logger.info('Leave type created', { leaveTypeId: id, by: reqUser.id });
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT id, name, displayName, description, code, classification, isHalfDayAllowed,
              annualEntitlementDays, isUnlimited, appliesToBoardLevel, isActive
       FROM leave_types WHERE id = ?`,
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

    // Organisation-wide policy fields: the entitlement and the two exception
    // flags (unlimited, board-level) can be changed here.
    const allowed = [
      'displayName', 'description', 'code', 'classification', 'isHalfDayAllowed', 'isActive',
      'annualEntitlementDays', 'isUnlimited', 'appliesToBoardLevel',
    ];
    const booleanFields = ['isHalfDayAllowed', 'isActive', 'isUnlimited', 'appliesToBoardLevel'];
    const numericFields = ['annualEntitlementDays'];

    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (payload[key] !== undefined) {
        sets.push(`${key} = ?`);
        let value = payload[key];
        if (booleanFields.includes(key)) value = value ? 1 : 0;
        if (numericFields.includes(key)) value = Number(value) || 0;
        params.push(value);
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
      `SELECT id, name, displayName, description, code, classification, isHalfDayAllowed,
              annualEntitlementDays, isUnlimited, appliesToBoardLevel, isActive
       FROM leave_types WHERE id = ?`,
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

  // Initialize per-year balances for an employee from each leave type's
  // configured annual entitlement. Entitlements are set organisation-wide on
  // the leave type itself (annualEntitlementDays); unlimited leave types
  // (board-level members) are not given a numeric balance, and board-level
  // employees get those unlimited types instead.
  static async initializeBalances(reqUser, employeeId, year) {
    const prismaClient = getPrisma();

    const emp = await prismaClient.$queryRawUnsafe(
      'SELECT id, name, designation FROM employees WHERE id = ? LIMIT 1',
      employeeId
    );
    if (!emp.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }
    const isBoardLevel = LeaveService.isBoardLevel(emp[0]);

    const targetYear = Number(year) || new Date().getFullYear();
    const types = await prismaClient.$queryRawUnsafe(
      'SELECT id, annualEntitlementDays, isUnlimited, appliesToBoardLevel FROM leave_types WHERE isActive = 1'
    );
    if (!types.length) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'No active leave types configured.', 400);
    }

    let created = 0;
    let skippedUnlimited = 0;
    for (const t of types) {
      const existing = await prismaClient.$queryRawUnsafe(
        'SELECT id FROM leave_balances WHERE employeeId = ? AND leaveTypeId = ? AND year = ? LIMIT 1',
        employeeId, t.id, targetYear
      );
      if (existing.length) continue;

      // Unlimited types get no ledger row: they have no cap, so a balance
      // number would be meaningless. The UI treats "unlimited" separately.
      if (Number(t.isUnlimited) === 1 && !Number(t.appliesToBoardLevel)) {
        skippedUnlimited += 1;
        continue;
      }

      const opening = Number(t.annualEntitlementDays || 0);
      await prismaClient.$executeRawUnsafe(
        `INSERT INTO leave_balances
           (id, employeeId, leaveTypeId, openingBalance, accruedBalance, usedBalance, reservedBalance, availableBalance, year, lastAccruedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0.00, 0.00, 0.00, ?, ?, NOW(), NOW(), NOW())`,
        crypto.randomUUID(), employeeId, t.id, opening, opening, targetYear
      );
      created += 1;
    }

    logger.info('Leave balances initialised', { employeeId, targetYear, created, skippedUnlimited, by: reqUser.id });
    return { employeeId, year: targetYear, created, skippedUnlimited, isBoardLevel };
  }

  // Annual population: give every active employee their year's balances from
  // the organisation-wide leave policy in one run. This is the "configure
  // system widely" action — a single call covers the whole organisation.
  static async populateYearlyForAll(reqUser, year) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only HR Admin or Super Admin can populate leave balances.', 403);
    }
    const prismaClient = getPrisma();
    const targetYear = Number(year) || new Date().getFullYear();

    const employees = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM employees WHERE isActive = 1'
    );
    let processed = 0;
    let failed = 0;
    for (const emp of employees) {
      try {
        await LeaveService.initializeBalances(reqUser, emp.id, targetYear);
        processed += 1;
      } catch {
        failed += 1;
      }
    }

    logger.info('Yearly leave balances populated', { targetYear, processed, failed, by: reqUser.id });
    return { year: targetYear, employees: employees.length, processed, failed };
  }

  // Monthly accrual now distributes a monthly share of the annual entitlement
  // across the year, rather than being a no-op.
  // Populates the yearly balances for every active employee at once. This is
  // the "configure the system widely" action: entitlements are set on the
  static async processMonthlyAccrual(reqUser, year, month) {
    const prismaClient = getPrisma();
    const targetYear = Number(year) || new Date().getFullYear();
    const targetMonth = Number(month) || new Date().getMonth() + 1;

    const types = await prismaClient.$queryRawUnsafe(
      'SELECT id, annualEntitlementDays, isUnlimited FROM leave_types WHERE isActive = 1'
    );
    let accrued = 0;
    for (const t of types) {
      if (Number(t.isUnlimited) === 1) continue; // unlimited types have no accrual
      const monthlyShare = (Number(t.annualEntitlementDays || 0) / 12).toFixed(2);
      const affected = await prismaClient.$executeRawUnsafe(
        `UPDATE leave_balances
           SET accruedBalance = accruedBalance + ?, availableBalance = availableBalance + ?
           WHERE leaveTypeId = ? AND year = ?`,
        monthlyShare, monthlyShare, t.id, targetYear
      );
      accrued += Number(affected);
    }

    logger.info('Monthly accrual processed', { targetYear, targetMonth, rowsUpdated: accrued, by: reqUser.id });
    return { year: targetYear, month: targetMonth, rowsUpdated: accrued };
  }

  // Board-level designation check. The live employees table has no dedicated
  // "level" column, so board-level membership is inferred from the employee's
  // designation string (CEO, C-suite, board titles). The designation value
  // shown on the employee record is authoritative.
  static isBoardLevel(empRow) {
    const BOARD_TOKENS = ['ceo', 'cto', 'cfo', 'coo', 'chairman', 'founder', 'partner', 'director'];
    const desig = String(empRow.designation || '').toLowerCase();
    return BOARD_TOKENS.some((token) => desig.includes(token));
  }

  static async approveRequest(reqUser, id, comment) {
    return LeaveService.reviewLeave(reqUser, id, { decision: 'APPROVE', note: comment });
  }

  static async rejectRequest(reqUser, id, comment) {
    return LeaveService.reviewLeave(reqUser, id, { decision: 'REJECT', note: comment });
  }
}

module.exports = { LeaveService, resolveEmployeeId };
