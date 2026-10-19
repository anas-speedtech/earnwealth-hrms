const { getPrisma } = require('./auth.service');
const { Prisma } = require('@prisma/client');
const { logger } = require('../utils/logger');
const { AppError, AppErrorCodes } = require('../errors/AppError');

/**
 * Audit log access.
 *
 * Queries use Prisma's `Prisma.sql` tagged template. That builds the SQL text
 * from fixed fragments and binds every value as a parameter, so user-supplied
 * filters cannot inject SQL. A plain $queryRawUnsafe with a parameter array
 * does not work here — Prisma's MySQL driver rejects arrays outright.
 *
 * Reads are restricted to SUPER_ADMIN by the route. There is deliberately no
 * write path in this service: audit rows are produced by the operations
 * themselves.
 */
class AuditService {
  /**
   * @param {object} actor the requesting user, already authenticated
   * @param {object} filters { page, limit, action, entityType, actorId, from, to, search }
   */
  static async list(actor, filters = {}) {
    const prismaClient = getPrisma();

    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 25));
    const offset = (page - 1) * limit;

    // Each condition is a fixed SQL fragment paired with its bound value.
    // The fragments are the only thing concatenated; the values are never
    // interpolated into the SQL text.
    const conditions = [];

    if (filters.action) {
      conditions.push(Prisma.sql`a.action = ${String(filters.action)}`);
    }
    if (filters.entityType) {
      conditions.push(Prisma.sql`a.entityType = ${String(filters.entityType)}`);
    }
    if (filters.actorId) {
      conditions.push(Prisma.sql`a.actorId = ${String(filters.actorId)}`);
    }
    if (filters.from) {
      const from = new Date(filters.from);
      if (Number.isNaN(from.getTime())) {
        throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid "from" date.', 400);
      }
      conditions.push(Prisma.sql`a.createdAt >= ${from}`);
    }
    if (filters.to) {
      const to = new Date(filters.to);
      if (Number.isNaN(to.getTime())) {
        throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid "to" date.', 400);
      }
      // A date with no time is treated as covering the whole day.
      if (String(filters.to).length === 10) to.setHours(23, 59, 59, 999);
      conditions.push(Prisma.sql`a.createdAt <= ${to}`);
    }
    if (filters.search && String(filters.search).trim()) {
      const term = `%${String(filters.search).trim()}%`;
      conditions.push(
        Prisma.sql`(a.entityId LIKE ${term} OR a.action LIKE ${term} OR u.email LIKE ${term})`
      );
    }

    // limit and offset are integers derived above, not user input.
    const whereClause = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    try {
      const rows = await prismaClient.$queryRaw(
        Prisma.sql`
          SELECT a.id, a.actorId, a.actorRole, a.action, a.entityType, a.entityId,
                 a.createdAt, u.email AS actorEmail, u.name AS actorName
          FROM audit_logs a
          LEFT JOIN users u ON u.id = a.actorId
          ${whereClause}
          ORDER BY a.createdAt DESC
          LIMIT ${limit} OFFSET ${offset}
        `
      );

      const countRows = await prismaClient.$queryRaw(
        Prisma.sql`
          SELECT COUNT(*) AS total
          FROM audit_logs a
          LEFT JOIN users u ON u.id = a.actorId
          ${whereClause}
        `
      );

      const total = Number(countRows[0] ? countRows[0].total : 0);

      return {
        logs: rows.map((r) => ({
          id: String(r.id),
          actorId: r.actorId === null ? null : String(r.actorId),
          actorEmail: r.actorEmail || null,
          actorName: r.actorName || null,
          actorRole: r.actorRole,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          createdAt: r.createdAt,
        })),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    } catch (err) {
      logger.error('Failed to read audit logs', { error: err.message, actorId: actor.id });
      throw new AppError(AppErrorCodes.INTERNAL_ERROR, 'Could not load audit logs.', 500);
    }
  }

  /**
   * The distinct action and entity types actually present, so the filter
   * dropdowns offer only values that will return rows.
   */
  static async getFilterOptions(actor) {
    const prismaClient = getPrisma();
    try {
      const actions = await prismaClient.$queryRawUnsafe(
        'SELECT DISTINCT action FROM audit_logs ORDER BY action'
      );
      const types = await prismaClient.$queryRawUnsafe(
        'SELECT DISTINCT entityType FROM audit_logs ORDER BY entityType'
      );
      return {
        actions: actions.map((r) => r.action),
        entityTypes: types.map((r) => r.entityType),
      };
    } catch (err) {
      logger.error('Failed to read audit filter options', { error: err.message });
      throw new AppError(AppErrorCodes.INTERNAL_ERROR, 'Could not load audit filters.', 500);
    }
  }
}

module.exports = { AuditService };
