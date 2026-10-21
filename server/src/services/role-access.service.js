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

/**
 * The four access levels shown on the Role tab. `view`/`edit` are the
 * per-role grants managed on the Controls screen.
 */
const ROLE_DEFS = [
  { key: 'SUPER_ADMIN', label: 'Super Admin', description: 'Full system access' },
  { key: 'HR_ADMIN', label: 'HR Admin', description: 'All options except own removal' },
  { key: 'MANAGER', label: 'Manager', description: 'Team-level approvals' },
  { key: 'EMPLOYEE', label: 'Employee', description: 'Own records and requests' },
];

// The two privileged levels can never be disabled: doing so would lock the
// system out of any account that can still grant View/Edit.
const LOCKED_VIEW = ['SUPER_ADMIN', 'HR_ADMIN'];
const LOCKED_EDIT = ['SUPER_ADMIN'];

class RoleAccessService {
  /** Ensure the backing table and its four seed rows exist. */
  static async ensureTable(prismaClient) {
    await prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS role_access (
        roleKey     VARCHAR(30)  NOT NULL PRIMARY KEY,
        canView     TINYINT(1)   NOT NULL DEFAULT 1,
        canEdit     TINYINT(1)   NOT NULL DEFAULT 0,
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )`);

    for (const def of ROLE_DEFS) {
      await prismaClient.$executeRawUnsafe(
        `INSERT IGNORE INTO role_access (roleKey, canView, canEdit) VALUES (?, ?, ?)`,
        def.key,
        LOCKED_VIEW.includes(def.key) ? 1 : 0,
        LOCKED_EDIT.includes(def.key) ? 1 : 0,
      );
    }
  }

  static canManage(reqUser) {
    return reqUser.role === Role.SUPER_ADMIN || reqUser.role === Role.HR_ADMIN;
  }

  static async list(reqUser) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view role access.', 403);
    }

    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);

    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT roleKey, canView, canEdit FROM role_access'
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.roleKey, r]));

    return ROLE_DEFS.map((def) => {
      const row = byKey[def.key] || {};
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        view: LOCKED_VIEW.includes(def.key) ? true : Boolean(row.canView),
        edit: LOCKED_EDIT.includes(def.key) ? true : Boolean(row.canEdit),
      };
    });
  }

  static async update(reqUser, key, { view, edit }) {
    if (!this.canManage(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to change role access.', 403);
    }

    const def = ROLE_DEFS.find((d) => d.key === key);
    if (!def) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Unknown role.', 404);
    }

    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);

    // The privileged levels are locked: Super Admin always has View + Edit,
    // HR Admin always has View. Only the mutable part is written.
    const canView = LOCKED_VIEW.includes(key) ? 1 : view ? 1 : 0;
    const canEdit = LOCKED_EDIT.includes(key) ? 1 : edit ? 1 : 0;

    await prismaClient.$executeRawUnsafe(
      'UPDATE role_access SET canView = ?, canEdit = ? WHERE roleKey = ?',
      canView,
      canEdit,
      key,
    );

    // The audit_logs table stores actorId as VARCHAR, so the Int user id
    // must be stringified before the Prisma write.
    await prismaClient.auditLog.create({
      data: {
        actorId: String(reqUser.id),
        actorRole: reqUser.role,
        action: 'UPDATE_ROLE_ACCESS',
        entityType: 'RoleAccess',
        entityId: key,
      },
    });

    logger.info('Role access updated', { roleKey: key, canView, canEdit, actorId: reqUser.id });

    return this.list(reqUser);
  }
}

module.exports = { RoleAccessService, ROLE_DEFS };
