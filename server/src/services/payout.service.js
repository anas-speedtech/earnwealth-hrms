const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

let prisma;
function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

function canAccessAll(user) {
  return [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(user.role);
}

/**
 * Payout Details — the per-employee earnings / deductions structure and bank
 * details that feed the payslip.
 *
 * Stored in its own `payout_details` table (keyed by employee code, the live
 * identity that joins the HR records) with a full change log in
 * `payout_history` (before/after snapshots, actor, confirmed code) in
 * addition to the standard `audit_logs` entry. Both tables are created
 * idempotently, matching the ensure-table pattern used for salary_rules,
 * salary_payheads and role_access — the live DB is hand-managed, so no
 * migration step is required.
 *
 * Before a structure is written, the caller must confirm the employee ID
 * (employee code) explicitly; a mismatch blocks the update.
 */
class PayoutService {
  static ensureTables(prismaClient) {
    return Promise.all([
      prismaClient.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS payout_details (
          id            INT(11)      NOT NULL AUTO_INCREMENT,
          employeeCode VARCHAR(50)   NOT NULL,
          earnings     TEXT          NOT NULL,
          deductions   TEXT          NOT NULL,
          bankName     VARCHAR(100)  DEFAULT NULL,
          accountNumber VARCHAR(30)  DEFAULT NULL,
          version      INT           NOT NULL DEFAULT 1,
          createdBy    VARCHAR(191)  DEFAULT NULL,
          updatedBy    VARCHAR(191)  DEFAULT NULL,
          createdAt    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY payout_details_code_key (employeeCode)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`),
      prismaClient.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS payout_history (
          id            INT(11)      NOT NULL AUTO_INCREMENT,
          employeeCode  VARCHAR(50)  NOT NULL,
          version       INT          NOT NULL,
          action        VARCHAR(20)  NOT NULL,
          beforeData    TEXT         DEFAULT NULL,
          afterData     TEXT         NOT NULL,
          actorId       VARCHAR(191) DEFAULT NULL,
          actorRole     VARCHAR(191) NOT NULL,
          confirmedCode VARCHAR(50)  DEFAULT NULL,
          createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          KEY payout_history_code_idx (employeeCode, createdAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`),
    ]);
  }

  static async resolveEmployee(prismaClient, employeeId) {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, employeeCode, name FROM employees WHERE id = ? LIMIT 1',
      employeeId
    );
    if (!rows || !rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }
    return rows[0];
  }

  // ---- line items ----

  /** Coerce a client-side line list into clean `{ label, amount }` rows. */
  static normalizeLines(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l) => l && String(l.label || '').trim())
      .slice(0, 50)
      .map((l) => ({
        label: String(l.label).trim().slice(0, 100),
        amount: Math.max(0, Number(l.amount) || 0),
      }));
  }

  /** Parse the stored TEXT JSON column; never throw on legacy/broken data. */
  static parseLines(raw) {
    try {
      const arr = JSON.parse(raw);
      return PayoutService.normalizeLines(Array.isArray(arr) ? arr : []);
    } catch {
      return [];
    }
  }

  static sumPaise(lines) {
    let paise = 0;
    for (const l of lines || []) paise += Math.max(0, Math.round((Number(l.amount) || 0) * 100));
    return paise / 100;
  }

  static totalsOf(earnings, deductions) {
    const grossEarnings = PayoutService.sumPaise(earnings);
    const grossDeductions = PayoutService.sumPaise(deductions);
    return { grossEarnings, grossDeductions, takeHome: grossEarnings - grossDeductions };
  }

  // ---- read ----

  /** The current payout structure for one employee, or null when unset. */
  static async getForEmployee(reqUser, employeeId) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view payout details.', 403);
    }
    const prismaClient = getPrisma();
    await PayoutService.ensureTables(prismaClient);
    const emp = await PayoutService.resolveEmployee(prismaClient, employeeId);

    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT earnings, deductions, bankName, accountNumber, version,
              createdBy, updatedBy, createdAt, updatedAt
       FROM payout_details WHERE employeeCode = ? LIMIT 1`,
      emp.employeeCode
    );
    if (!rows || !rows.length) return null;

    const r = rows[0];
    const earnings = PayoutService.parseLines(r.earnings);
    const deductions = PayoutService.parseLines(r.deductions);
    return {
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      earnings,
      deductions,
      ...PayoutService.totalsOf(earnings, deductions),
      bankName: r.bankName || '',
      accountNumber: r.accountNumber || '',
      version: Number(r.version || 1),
      createdBy: r.createdBy || null,
      updatedBy: r.updatedBy || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  // ---- write (confirmation-gated) ----

  /**
   * Creates or updates the payout structure.
   *
   * `data.confirmedEmployeeCode` must equal the employee's code — the HR
   * confirmation gate (the UI makes HR type the ID in before submitting).
   * Every write records a before/after snapshot in `payout_history` and an
   * `audit_logs` entry.
   */
  static async update(reqUser, employeeId, data) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update payout details.', 403);
    }
    const prismaClient = getPrisma();
    await PayoutService.ensureTables(prismaClient);
    const emp = await PayoutService.resolveEmployee(prismaClient, employeeId);

    const earnings = PayoutService.normalizeLines(data.earnings);
    const deductions = PayoutService.normalizeLines(data.deductions || []);
    const bankName = (data.bankName || '').trim() || null;
    const accountNumber = (data.accountNumber || '').trim() || null;

    // ---- the confirmation gate: the entered ID must match the employee ----
    const confirmed = String(data.confirmedEmployeeCode ?? '').trim();
    if (!confirmed) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Enter the employee ID to confirm this update.', 400);
    }
    if (confirmed.toUpperCase() !== String(emp.employeeCode).toUpperCase()) {
      throw new AppError(
        AppErrorCodes.VALIDATION_ERROR,
        `Employee ID confirmation failed: "${confirmed}" does not match ${emp.employeeCode}. No change was saved.`,
        400
      );
    }

    // Current row (for versioning + the before-snapshot).
    const oldRows = await prismaClient.$queryRawUnsafe(
      'SELECT earnings, deductions, bankName, accountNumber, version FROM payout_details WHERE employeeCode = ? LIMIT 1',
      emp.employeeCode
    );
    const hadRow = Boolean(oldRows && oldRows.length);
    const oldVersion = hadRow ? Number(oldRows[0].version || 0) : 0;

    const beforeSnapshot = hadRow
      ? {
          earnings: PayoutService.parseLines(oldRows[0].earnings),
          deductions: PayoutService.parseLines(oldRows[0].deductions),
          bankName: oldRows[0].bankName || '',
          accountNumber: oldRows[0].accountNumber || '',
        }
      : null;
    const afterSnapshot = { earnings, deductions, bankName: bankName || '', accountNumber: accountNumber || '' };

    await prismaClient.$executeRawUnsafe(
      `INSERT INTO payout_details
         (employeeCode, earnings, deductions, bankName, accountNumber, version, createdBy, updatedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         earnings = VALUES(earnings),
         deductions = VALUES(deductions),
         bankName = VALUES(bankName),
         accountNumber = VALUES(accountNumber),
         version = VALUES(version),
         updatedBy = VALUES(updatedBy),
         updatedAt = NOW(3)`,
      emp.employeeCode,
      JSON.stringify(earnings),
      JSON.stringify(deductions),
      bankName,
      accountNumber,
      oldVersion + 1,
      hadRow ? null : String(reqUser.id),
      String(reqUser.id)
    );

    // ---- tracking: full before/after change log ----
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO payout_history
         (employeeCode, version, action, beforeData, afterData, actorId, actorRole, confirmedCode, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      emp.employeeCode,
      oldVersion + 1,
      hadRow ? 'UPDATED' : 'CREATED',
      beforeSnapshot ? JSON.stringify(beforeSnapshot) : null,
      JSON.stringify(afterSnapshot),
      String(reqUser.id),
      reqUser.role,
      confirmed
    );

    // ---- logs: standard audit trail ----
    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: String(reqUser.id),
          actorRole: reqUser.role,
          action: hadRow ? 'UPDATE_PAYOUT' : 'CREATE_PAYOUT',
          entityType: 'PayoutDetails',
          entityId: String(emp.employeeCode),
          beforeValue: beforeSnapshot ? JSON.stringify(beforeSnapshot) : null,
          afterValue: JSON.stringify(afterSnapshot),
        },
      });
    } catch (err) {
      logger.warn('Payout audit log write failed', { error: err.message });
    }

    logger.info('Payout details updated', {
      employeeCode: emp.employeeCode,
      version: oldVersion + 1,
      actorId: reqUser.id,
    });

    return PayoutService.getForEmployee(reqUser, employeeId);
  }

  // ---- history ----

  /** Recent change log entries for one employee (most recent first). */
  static async history(reqUser, employeeId, limit = 20) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view payout history.', 403);
    }
    const prismaClient = getPrisma();
    await PayoutService.ensureTables(prismaClient);
    const emp = await PayoutService.resolveEmployee(prismaClient, employeeId);

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT ph.id, ph.version, ph.action, ph.beforeData, ph.afterData,
              ph.actorId, ph.actorRole, ph.confirmedCode, ph.createdAt,
              u.name AS actorName, u.email AS actorEmail
       FROM payout_history ph
       LEFT JOIN users u ON u.id = ph.actorId
       WHERE ph.employeeCode = ?
       ORDER BY ph.id DESC
       LIMIT ${safeLimit}`,
      emp.employeeCode
    );

    const parseSnapshot = (raw) => {
      if (!raw) return null;
      try {
        const s = JSON.parse(raw);
        return {
          earnings: PayoutService.normalizeLines(s.earnings),
          deductions: PayoutService.normalizeLines(s.deductions),
          bankName: s.bankName || '',
          accountNumber: s.accountNumber || '',
        };
      } catch {
        return null;
      }
    };

    return (rows || []).map((r) => {
      const after = parseSnapshot(r.afterData);
      return {
        id: String(r.id),
        version: Number(r.version),
        action: r.action,
        actorName: r.actorName || r.actorId || '',
        actorRole: r.actorRole,
        actorEmail: r.actorEmail || '',
        confirmedCode: r.confirmedCode || '',
        createdAt: r.createdAt,
        before: parseSnapshot(r.beforeData),
        after,
        ...(after ? PayoutService.totalsOf(after.earnings, after.deductions) : {}),
      };
    });
  }
}

module.exports = { PayoutService };
