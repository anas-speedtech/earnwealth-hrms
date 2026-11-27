const { getPrisma } = require('./auth.service');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { moduleLogger } = require('../utils/logger');
const logger = moduleLogger('services.wfh-allocation.service');

/**
 * Standing WFH allocation (Configuration → WFH Allocation).
 *
 * A per-day WFH *request* is the employee's own application, reviewed by HR.
 * An *allocation* is different: HR proactively exempts an employee from
 * device attendance so they self-punch their day. Consequences, enforced in
 * the attendance engine (AttendanceService):
 *
 *   - only TODAY's calendar day is editable for that employee — previous and
 *     future days stay locked,
 *   - punch-in may not be a future time, punch-out may not be a past time.
 *
 * Storage: the `wfh_allocations` table, keyed by the legacy `employees.id`
 * (the attendance engine's key space, matching how wfh_requests is read
 * there in this deployment). `revokedAt` null = active. The table is
 * created idempotently here, matching this repo's hand-managed-DB pattern.
 */

class WFHAllocationService {
  static async ensureTable(prismaClient) {
    return prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS wfh_allocations (
        id INT(11) NOT NULL AUTO_INCREMENT,
        employeeId INT(11) NOT NULL,
        allocatedBy INT(11) DEFAULT NULL,
        allocatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        revokedAt DATETIME(3) DEFAULT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_wfh_allocation_emp (employeeId),
        KEY wfh_allocations_employee_idx (employeeId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  static async gate(reqUser) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only HR Admin or Super Admin can manage WFH allocations.', 403);
    }
    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);
    return prismaClient;
  }

  /** Resolve an employee by code (the HR-facing identifier) to the legacy row. */
  static async findByCode(prismaClient, employeeCode) {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, employeeCode, name, isActive FROM employees WHERE employeeCode = ? LIMIT 1',
      String(employeeCode).trim().toUpperCase()
    );
    const row = rows && rows[0];
    if (!row) {
      throw new AppError(AppErrorCodes.NOT_FOUND, `No employee found with code "${String(employeeCode).trim()}".`, 404);
    }
    return row;
  }

  /** Allocate WFH to an employee by code. Idempotent — re-allocating is a no-op. */
  static async allocate(reqUser, employeeCode) {
    const prismaClient = await this.gate(reqUser);
    const emp = await this.findByCode(prismaClient, employeeCode);

    const existing = await prismaClient.wfhAllocation.findUnique({ where: { employeeId: Number(emp.id) } });
    if (existing && existing.revokedAt) {
      await prismaClient.wfhAllocation.update({
        where: { id: existing.id },
        data: { revokedAt: null, allocatedBy: Number(reqUser.id), allocatedAt: new Date() },
      });
    } else if (!existing) {
      await prismaClient.wfhAllocation.create({
        data: { employeeId: Number(emp.id), allocatedBy: Number(reqUser.id) },
      });
    }

    await prismaClient.auditLog.create({
      data: {
        actorId: String(reqUser.id),
        actorRole: reqUser.role,
        action: 'ALLOCATE_WFH',
        entityType: 'WFHAllocation',
        entityId: String(emp.id),
        metadata: JSON.stringify({ employeeCode: emp.employeeCode }),
      },
    });
    logger.info('WFH allocated', { employeeCode: emp.employeeCode, by: reqUser.id });
    return { employeeId: String(emp.id), employeeCode: emp.employeeCode, name: emp.name, allocated: true };
  }

  /** Revoke an allocation by employee code. Idempotent. */
  static async revoke(reqUser, employeeCode) {
    const prismaClient = await this.gate(reqUser);
    const emp = await this.findByCode(prismaClient, employeeCode);

    const existing = await prismaClient.wfhAllocation.findUnique({ where: { employeeId: Number(emp.id) } });
    if (existing && !existing.revokedAt) {
      await prismaClient.wfhAllocation.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    }

    await prismaClient.auditLog.create({
      data: {
        actorId: String(reqUser.id),
        actorRole: reqUser.role,
        action: 'REVOKE_WFH_ALLOCATION',
        entityType: 'WFHAllocation',
        entityId: String(emp.id),
        metadata: JSON.stringify({ employeeCode: emp.employeeCode }),
      },
    });
    logger.info('WFH allocation revoked', { employeeCode: emp.employeeCode, by: reqUser.id });
    return { employeeId: String(emp.id), employeeCode: emp.employeeCode, name: emp.name, allocated: false };
  }

  /** Every active allocation, joined to the employee's code/name/email. */
  static async list(reqUser) {
    const prismaClient = await this.gate(reqUser);
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT a.employeeId, a.allocatedBy, a.allocatedAt,
              e.employeeCode, e.name AS employeeName, u.email AS employeeEmail
       FROM wfh_allocations a
       LEFT JOIN employees e ON e.id = a.employeeId
       LEFT JOIN users u ON u.id = e.userId
       WHERE a.revokedAt IS NULL
       ORDER BY e.employeeCode ASC`
    );
    const istDay = (v) => (v ? new Date(new Date(v).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : '');
    return (rows || []).map((r) => ({
      employeeId: String(r.employeeId),
      employeeCode: r.employeeCode || '',
      employeeName: r.employeeName || '',
      employeeEmail: r.employeeEmail || '',
      allocatedBy: r.allocatedBy,
      allocatedAt: istDay(r.allocatedAt),
    }));
  }

  /**
   * Is this legacy employee.id currently WFH-allocated? Used by the
   * attendance engine — reads directly so it works for the raw-SQL engine.
   */
  static async isActiveFor(prismaClient, legacyEmployeeId) {
    try {
      await this.ensureTable(prismaClient);
      const rows = await prismaClient.$queryRawUnsafe(
        'SELECT 1 FROM wfh_allocations WHERE employeeId = ? AND revokedAt IS NULL LIMIT 1',
        legacyEmployeeId
      );
      return Boolean(rows && rows.length);
    } catch {
      return false; // Table missing / query failed → not allocated, fall back to WFH-request rules.
    }
  }
}

module.exports = { WFHAllocationService };
