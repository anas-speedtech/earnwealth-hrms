const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

let prismaInstance;
function getPrisma() {
  if (!prismaInstance) prismaInstance = new PrismaClient();
  return prismaInstance;
}

const PAGE_SIZE = 20;

/**
 * Comp-Off module.
 *
 * Written against the live MySQL tables with raw SQL.
 * comp_off_credits: earned comp-off credits (earnedDays, usedDays, status)
 * comp_off_ledger:  double-entry ledger of EARN/USE/ADJUST events
 * comp_off_policy:  single active policy row (expiry, min-worked-hours)
 *
 * Live column names: earnedDays / usedDays (not credits / remainingAmount).
 * employees.name is a single VARCHAR (not firstName/lastName).
 */

async function resolveEmployeeId(prismaClient, reqUser, targetEmployeeId) {
  if (!targetEmployeeId || String(targetEmployeeId) === String(reqUser.id)) {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM employees WHERE userId = ? LIMIT 1',
      reqUser.id
    );
    if (!rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }
    return rows[0].id;
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

function canAccessAll(user) {
  return user.role === Role.SUPER_ADMIN || user.role === Role.HR_ADMIN || user.role === Role.HR_ADMIN;
}

class CompOffService {
  // ---- Policy ----

  static async getPolicy(user) {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, expiryMonths, minWorkedHours, maxDaysPerMonth, isActive, createdAt FROM comp_off_policy WHERE isActive = 1 LIMIT 1'
    );
    if (!rows.length) {
      // Create a sensible default rather than returning nothing. Return the
      // constructed row directly instead of recursing, because the insert may
      // not persist under a mocked client and recursion would loop forever.
      const id = crypto.randomUUID();
      const now = new Date();
      await prismaClient.$executeRawUnsafe(
        "INSERT INTO comp_off_policy (id, expiryMonths, minWorkedHours, maxDaysPerMonth, isActive, createdAt, updatedAt) VALUES (?, 3, 4.00, 2, 1, NOW(), NOW())",
        id
      );
      return { id, expiryMonths: 3, minWorkedHours: 4, maxDaysPerMonth: 2, isActive: 1, createdAt: now, updatedAt: now };
    }
    return rows[0];
  }

  static async updatePolicy(user, data) {
    if (!canAccessAll(user)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot update the comp-off policy.', 403);
    }
    const prismaClient = getPrisma();
    const { expiryMonths, minWorkedHours, maxDaysPerMonth } = data;
    await prismaClient.$executeRawUnsafe(
      'UPDATE comp_off_policy SET expiryMonths = ?, minWorkedHours = ?, maxDaysPerMonth = ?, updatedAt = NOW() WHERE isActive = 1 LIMIT 1',
      expiryMonths ?? 3, minWorkedHours ?? 4, maxDaysPerMonth ?? 2
    );
    logger.info('Comp-off policy updated', { by: user.id });
    await prismaClient.auditLog.create({
      data: { actorId: user.id, actorRole: user.role, action: 'UPDATE_COMPOFF_POLICY', entityType: 'CompOffPolicy', entityId: 'policy' }
    });
    return CompOffService.getPolicy(user);
  }

  // ---- Balance ----

  /**
   * Per-employee comp-off summary: total earned, used, and available days.
   */
  static async getBalanceByEmployeeId(reqUser, employeeId) {
    const prismaClient = getPrisma();
    const empId = await resolveEmployeeId(prismaClient, reqUser, employeeId);

    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'EARN' THEN amount ELSE 0 END), 0) AS totalEarned,
         COALESCE(SUM(CASE WHEN type = 'USE'   THEN amount ELSE 0 END), 0) AS totalUsed,
         COALESCE(SUM(CASE WHEN type = 'ADJUST' THEN amount ELSE 0 END), 0) AS totalAdjusted
       FROM comp_off_ledger
       WHERE employeeId = ?`,
      empId
    );

    const earned = Number(rows[0].totalEarned || 0);
    const used = Number(rows[0].totalUsed || 0);
    const adjusted = Number(rows[0].totalAdjusted || 0);
    const available = earned - used + adjusted;

    return { employeeId: empId, totalEarned: earned, totalUsed: used, totalAdjusted: adjusted, available };
  }

  static async getEligibleDates(reqUser, month, year) {
    if (!reqUser) throw new AppError(AppErrorCodes.UNAUTHORIZED, 'Authentication required.');
    const prismaClient = getPrisma();
    const empId = await resolveEmployeeId(prismaClient, reqUser, null);

    const policy = await CompOffService.getPolicy(reqUser);
    const minHours = Number(policy.minWorkedHours);

    // Find weekend days worked that could earn comp-off.
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT DATE(a.punchTime) AS workedDate
       FROM attendance_logs a
       WHERE a.employeeId = ?
         AND a.status = 'IN'
         AND a.punchTime >= ?
         AND a.punchTime < ?
         AND DAYOFWEEK(a.punchTime) IN (1, 7)
       GROUP BY DATE(a.punchTime)
       HAVING TIMESTAMPDIFF(HOUR,
         MIN(CASE WHEN a.status = 'IN' THEN a.punchTime END),
         MAX(CASE WHEN a.punchTime = (SELECT MAX(a2.punchTime) FROM attendance_logs a2 WHERE DATE(a2.punchTime) = DATE(a.punchTime) AND a2.employeeId = a.employeeId AND a2.status = 'OUT')
        )) >= ?
       ORDER BY workedDate`,
      empId, monthStart, nextMonth, minHours
    );

    return rows.map((r) => ({
      date: r.workedDate instanceof Date ? r.workedDate.toISOString().slice(0, 10) : String(r.workedDate).slice(0, 10),
      eligible: true,
    }));
  }

  // ---- Credits ----

  /**
   * List all comp-off credits for the requesting user (or all users for HR).
   */
  static async getMyCredits(reqUser, { page = 1, employeeId } = {}) {
    const prismaClient = getPrisma();
    const offset = (page - 1) * PAGE_SIZE;
    const scopeAll = canAccessAll(reqUser);

    let empId;
    if (!scopeAll) {
      empId = await resolveEmployeeId(prismaClient, reqUser, null);
    } else if (employeeId) {
      empId = await resolveEmployeeId(prismaClient, reqUser, employeeId);
    }

    const where = empId ? 'WHERE c.employeeId = ?' : 'WHERE 1=1';
    const params = empId ? [empId] : [];

    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT c.id, c.employeeId, e.employeeCode, e.name AS employeeName,
              c.sourceDate, c.earnedDays, c.usedDays,
              (c.earnedDays - c.usedDays) AS remaining,
              c.status, c.expiresAt, c.reason, c.approvedBy, c.approvedAt,
              c.createdAt
       FROM comp_off_credits c
       LEFT JOIN employees e ON e.id = c.employeeId
       ${where}
       ORDER BY c.sourceDate DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      ...params
    );

    const [countRows] = await Promise.all([
      prismaClient.$queryRawUnsafe(
        `SELECT COUNT(*) AS total FROM comp_off_credits c ${where}`,
        ...params
      ),
    ]);

    const total = Number(countRows[0].total);
    return {
      credits: rows.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeCode: r.employeeCode || '',
        employeeName: r.employeeName || '',
        sourceDate: r.sourceDate,
        earnedDays: Number(r.earnedDays),
        usedDays: Number(r.usedDays),
        remaining: Number(r.remaining),
        status: r.status,
        expiresAt: r.expiresAt,
        reason: r.reason || '',
        approvedBy: r.approvedBy || '',
        approvedAt: r.approvedAt || null,
        createdAt: r.createdAt,
      })),
      pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) },
    };
  }

  static async getCreditById(reqUser, id) {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT c.id, c.employeeId, e.userId, e.employeeCode, e.name AS employeeName,
              c.sourceDate, c.earnedDays, c.usedDays, (c.earnedDays - c.usedDays) AS remaining,
              c.status, c.expiresAt, c.reason, c.approvedBy, c.approvedAt, c.createdAt
       FROM comp_off_credits c
       LEFT JOIN employees e ON e.id = c.employeeId
       WHERE c.id = ? LIMIT 1`,
      id
    );
    if (!rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Comp-off credit not found.', 404);
    }
    const record = rows[0];
    if (!canAccessAll(reqUser) && record.userId !== reqUser.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot view this comp-off record.', 403);
    }
    return record;
  }

  // ---- Request credit ----

  static async requestCredit(reqUser, payload) {
    if (!reqUser) throw new AppError(AppErrorCodes.UNAUTHORIZED, 'Authentication required.');
    const prismaClient = getPrisma();
    const empId = await resolveEmployeeId(prismaClient, reqUser, null);
    const { sourceDate, earnedDays = 1, reason } = payload;

    const dup = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM comp_off_credits WHERE employeeId = ? AND sourceDate = ? LIMIT 1',
      empId, sourceDate
    );
    if (dup.length) {
      throw new AppError(AppErrorCodes.CONFLICT, 'A comp-off credit already exists for this date.', 409);
    }

    const id = crypto.randomUUID();
    const policy = await CompOffService.getPolicy(reqUser);
    const expiresAt = new Date(sourceDate);
    expiresAt.setDate(expiresAt.getDate() + policy.expiryMonths * 30);

    await prismaClient.$executeRawUnsafe(
      `INSERT INTO comp_off_credits
         (id, employeeId, sourceDate, earnedDays, usedDays, status, expiresAt, reason, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 0, 'AVAILABLE', ?, ?, NOW(), NOW())`,
      id, empId, sourceDate, earnedDays, expiresAt.toISOString().slice(0, 10), reason || null
    );

    await CompOffService._ledger(prismaClient, id, empId, 'EARN', earnedDays, 'Comp-off credited');
    await prismaClient.auditLog.create({
      data: { actorId: reqUser.id, actorRole: reqUser.role, action: 'CREATE_COMPOFF_REQUEST', entityType: 'CompOffCredit', entityId: id }
    });

    logger.info('Comp-off credited', { creditId: id, employeeId: empId, by: reqUser.id });
    return CompOffService.getCreditById(reqUser, id);
  }

  // ---- Ledger ----

  static async getLedger(reqUser, { employeeId, creditId, page = 1 } = {}) {
    const prismaClient = getPrisma();
    const offset = (page - 1) * PAGE_SIZE;
    const scopeAll = canAccessAll(reqUser);

    let empId;
    if (!scopeAll) {
      empId = await resolveEmployeeId(prismaClient, reqUser, null);
    } else if (employeeId) {
      empId = await resolveEmployeeId(prismaClient, reqUser, employeeId);
    }

    const conditions = [];
    const params = [];
    if (empId) { conditions.push('l.employeeId = ?'); params.push(empId); }
    if (creditId) { conditions.push('l.creditId = ?'); params.push(creditId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1';

    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT l.id, l.creditId, l.employeeId, e.employeeCode, e.name AS employeeName,
              l.type, l.amount, l.balanceAfter, l.note, l.createdAt
       FROM comp_off_ledger l
       LEFT JOIN employees e ON e.id = l.employeeId
       ${where}
       ORDER BY l.createdAt DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      ...params
    );

    const countRows = await prismaClient.$queryRawUnsafe(
      `SELECT COUNT(*) AS total FROM comp_off_ledger l ${where}`,
      ...params
    );
    const total = Number(countRows[0].total);

    return {
      ledger: rows,
      pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) },
    };
  }

  // ---- Redeem / Apply ----

  static async applyLeave(reqUser, payload) {
    const prismaClient = getPrisma();
    const empId = await resolveEmployeeId(prismaClient, reqUser, null);
    const { creditId, days = 1, note } = payload;

    const credit = await CompOffService.getCreditById(reqUser, creditId);
    const available = Number(credit.earnedDays) - Number(credit.usedDays);
    if (days > available) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Not enough comp-off days available.', 400);
    }

    const newUsed = Number(credit.usedDays) + days;
    const newStatus = newUsed >= Number(credit.earnedDays) ? 'FULLY_USED' : 'PARTIALLY_USED';

    await prismaClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'UPDATE comp_off_credits SET usedDays = ?, status = ?, updatedAt = NOW() WHERE id = ?',
        newUsed, newStatus, creditId
      );
      await CompOffService._ledger(tx, creditId, empId, 'USE', days, note || 'Comp-off availed');
      await tx.auditLog.create({
        data: { actorId: reqUser.id, actorRole: reqUser.role, action: 'CREATE_COMPOFF_LEAVE', entityType: 'CompOffLeave', entityId: creditId }
      });
    });

    logger.info('Comp-off used', { creditId, employeeId: empId, days, by: reqUser.id });
    return CompOffService.getCreditById(reqUser, creditId);
  }

  // ---- Pending leaves (HR view) ----

  static async getPendingLeaves(reqUser) {
    const prismaClient = getPrisma();
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot view pending comp-off requests.', 403);
    }
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT c.id, c.employeeId, e.employeeCode, e.name AS employeeName,
              c.sourceDate, c.earnedDays, c.status, c.reason, c.createdAt
       FROM comp_off_credits c
       LEFT JOIN employees e ON e.id = c.employeeId
       WHERE c.status = 'PENDING'
       ORDER BY c.createdAt ASC`
    );
    return rows;
  }

  // ---- Private helpers ----

  static async _ledger(prismaClient, creditId, employeeId, type, amount, note) {
    const id = crypto.randomUUID();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT COALESCE(SUM(CASE WHEN type = 'EARN' THEN amount ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN type = 'USE'   THEN amount ELSE 0 END), 0) +
              COALESCE(SUM(CASE WHEN type = 'ADJUST' THEN amount ELSE 0 END), 0) AS balance
       FROM comp_off_ledger WHERE employeeId = ?`,
      employeeId
    );
    const prev = Number(rows[0].balance || 0);
    const after = type === 'EARN' ? prev + amount : type === 'USE' ? prev - amount : prev + amount;

    await prismaClient.$executeRawUnsafe(
      `INSERT INTO comp_off_ledger (id, creditId, employeeId, type, amount, balanceAfter, note, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      id, creditId, employeeId, type, amount, after, note || null
    );
  }

  // ---- Route-facing aliases ----

  static async getMyBalance(reqUser) {
    if (!reqUser) throw new AppError(AppErrorCodes.UNAUTHORIZED, 'Authentication required.');
    return CompOffService.getBalanceByEmployeeId(reqUser, reqUser.id);
  }

  static async getMyLedger(reqUser, options) {
    if (!reqUser) throw new AppError(AppErrorCodes.UNAUTHORIZED, 'Authentication required.');
    return CompOffService.getLedger(reqUser, options);
  }

  static async getCreditDetail(reqUser, id) {
    return CompOffService.getCreditById(reqUser, id);
  }

  static async redeemCredit(reqUser, payload) {
    if (!reqUser) throw new AppError(AppErrorCodes.UNAUTHORIZED, 'Authentication required.');
    // redeemCredit receives { startDate, endDate, isHalfDay, reason }
    // but the applyLeave method expects { creditId, days, note }
    // We auto-select the oldest available credit.
    const prismaClient = getPrisma();
    const empId = await resolveEmployeeId(prismaClient, reqUser, null);
    const { startDate, endDate, isHalfDay, reason } = payload;

    // Find the oldest credit with remaining balance.
    const credit = await prismaClient.$queryRawUnsafe(
      `SELECT id, earnedDays, usedDays, (earnedDays - usedDays) AS remaining
       FROM comp_off_credits
       WHERE employeeId = ? AND status IN ('AVAILABLE','PARTIALLY_USED') AND expiresAt >= CURDATE()
       ORDER BY sourceDate ASC LIMIT 1`,
      empId
    );
    if (!credit.length || Number(credit[0].remaining) <= 0) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'No comp-off days available to redeem.', 400);
    }
    const days = isHalfDay ? 0.5 : 1;
    return CompOffService.applyLeave(reqUser, { creditId: credit[0].id, days, note: reason || '' });
  }

  static async getPendingCompOffLeaves(reqUser) {
    return CompOffService.getPendingLeaves(reqUser);
  }

  static async reviewCompOffLeave(reqUser, id, action, reviewComment) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot review comp-off requests.', 403);
    }
    const prismaClient = getPrisma();

    const credit = await CompOffService.getCreditById(reqUser, id);

    // Self-approval prevention: a user cannot approve/reject their own credit.
    if (credit.userId === reqUser.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'cannot approve your own comp-off credit.', 403);
    }

    // Status validation: only PENDING credits can be reviewed.
    if (credit.status !== 'PENDING') {
      throw new AppError(
        AppErrorCodes.VALIDATION_ERROR,
        `already ${credit.status.toLowerCase()}`,
        400
      );
    }

    // Rejection requires a reason.
    if (action === 'REJECT' && (!reviewComment || !reviewComment.trim())) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'A rejection reason is required.', 400);
    }

    if (action === 'APPROVE') {
      // Mark credit as available.
      await prismaClient.$executeRawUnsafe(
        `UPDATE comp_off_credits SET status = 'AVAILABLE', approvedBy = ?, approvedAt = NOW(), updatedAt = NOW() WHERE id = ?`,
        reqUser.role, id
      );
      // Record the earned credit in the ledger.
      await CompOffService._ledger(prismaClient, id, credit.employeeId, 'EARN', Number(credit.earnedDays), 'Comp-off credit approved');
      logger.info('Comp-off leave approved', { creditId: id, by: reqUser.id });
      await prismaClient.auditLog.create({
        data: { actorId: reqUser.id, actorRole: reqUser.role, action: 'APPROVE_COMPOFF_CREDIT', entityType: 'CompOffCredit', entityId: id }
      });
    } else {
      // Mark credit as rejected (do not delete, so it remains queryable).
      await prismaClient.$executeRawUnsafe(
        `UPDATE comp_off_credits SET status = 'REJECTED', rejectionReason = ?, updatedAt = NOW() WHERE id = ?`,
        reviewComment || '', id
      );
      // Record the released credit in the ledger.
      await CompOffService._ledger(prismaClient, id, credit.employeeId, 'RELEASED', Number(credit.earnedDays), 'Comp-off credit rejected: ' + (reviewComment || ''));
      logger.info('Comp-off leave rejected', { creditId: id, by: reqUser.id });
      await prismaClient.auditLog.create({
        data: { actorId: reqUser.id, actorRole: reqUser.role, action: 'REJECT_COMPOFF_CREDIT', entityType: 'CompOffCredit', entityId: id }
      });
    }
    return CompOffService.getCreditById(reqUser, id);
  }

  static async getPendingRequests(reqUser) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot view pending requests.', 403);
    }
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT c.id, c.employeeId, e.employeeCode, e.name AS employeeName,
              c.sourceDate, c.earnedDays, c.status, c.reason, c.createdAt
       FROM comp_off_credits c
       LEFT JOIN employees e ON e.id = c.employeeId
       WHERE c.status = 'PENDING'
       ORDER BY c.createdAt ASC`
    );
    return rows;
  }

  static async reviewCredit(reqUser, id, action, reason) {
    return CompOffService.reviewCompOffLeave(reqUser, id, action, reason);
  }

  static async getEmployeeBalance(reqUser, employeeId) {
    return CompOffService.getBalanceByEmployeeId(reqUser, employeeId);
  }

  static async getAllCredits(reqUser, options = {}) {
    return CompOffService.getMyCredits(reqUser, options);
  }

  static async processExpiredCredits(reqUser) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot process expired credits.', 403);
    }
    const prismaClient = getPrisma();
    const result = await prismaClient.$executeRawUnsafe(
      `UPDATE comp_off_credits SET status = 'EXPIRED', updatedAt = NOW()
       WHERE status IN ('AVAILABLE','PARTIALLY_USED') AND expiresAt < CURDATE()`
    );
    await prismaClient.auditLog.create({
      data: { actorId: reqUser.id, actorRole: reqUser.role, action: 'PROCESS_COMPOFF_EXPIRY', entityType: 'CompOffCredit', entityId: 'all' }
    });
    logger.info('Expired comp-off credits processed', { affected: result, by: reqUser.id });
    return { processed: result.affectedRows };
  }
}

CompOffService.__setPrisma = (client) => { prismaInstance = client; };

module.exports = { CompOffService };
