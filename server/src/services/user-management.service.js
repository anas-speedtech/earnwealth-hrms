const { getPrisma } = require('./auth.service');
const { hashPassword } = require('../utils/password');
const { AuthService } = require('./auth.service');
const { logger } = require('../utils/logger');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { sendAccountCreatedEmail } = require('./email.service');

/**
 * Management of privileged accounts (HR Admin and Employee).
 *
 * Every query is raw SQL. The live `users` table differs from schema.prisma:
 * `id` is INT auto-increment, the role enum contains HR_MANAGER rather than HR,
 * and there are no profile tables. The Prisma model would therefore reject
 * writes against this deployment.
 *
 * A Super Admin may provision every role account. Nobody may deactivate a
 * Super Admin account through this path, since that would lock everyone out.
 */
class UserManagementService {
  /**
   * Lists accounts of the given roles.
   * @param {string[]} roles the roles to include
   */
  static async listByRoles(roles) {
    const prismaClient = getPrisma();

    const placeholders = roles.map(() => '?').join(', ');
    // The live table has no lastLoginAt column, so the login timestamp is not
    // selected here. Adding it would require a migration.
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, name, email, role, isActive, createdAt ' +
        'FROM users WHERE role IN (' + placeholders + ') ORDER BY createdAt DESC',
      ...roles
    );

    return rows.map((r) => ({
      id: String(r.id),
      name: r.name || '',
      email: r.email,
      role: r.role,
      isActive: Boolean(r.isActive),
      createdAt: r.createdAt,
      lastLoginAt: null,
    }));
  }

  /**
   * Creates an HR Admin, Employee or Super Admin account.
   */
  static async create(actor, { name, email, password, role }) {
    if (!['HR_ADMIN', 'EMPLOYEE', 'SUPER_ADMIN'].includes(role)) {
      throw new AppError(
        AppErrorCodes.FORBIDDEN,
        'Only HR Admin, Employee and Super Admin accounts can be created here.',
        403
      );
    }

    const prismaClient = getPrisma();

    const existing = await prismaClient.$queryRaw`
      SELECT id FROM users WHERE email = ${email} LIMIT 1
    `;
    if (existing.length) {
      throw new AppError(
        AppErrorCodes.DUPLICATE_ENTRY,
        'An account with this email already exists.',
        409
      );
    }

    // Generate a random password if none provided (for Employee accounts created without password)
    let finalPassword = password;
    if (!password) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let generated = '';
      for (let i = 0; i < 12; i++) {
        generated += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      finalPassword = generated;
    }

    const passwordHash = await hashPassword(finalPassword);

    const created = await prismaClient.$executeRaw`
      INSERT INTO users (name, email, passwordHash, role, isActive, createdAt, updatedAt)
      VALUES (${name}, ${email}, ${passwordHash}, ${role}, 1, NOW(3), NOW(3))
    `;

    const rows = await prismaClient.$queryRaw`
      SELECT id, name, email, role, isActive, createdAt FROM users WHERE email = ${email} LIMIT 1
    `;
    const user = rows[0];

    await AuthService.logAudit(
      String(actor.id),
      actor.role,
      'CREATE_USER',
      'User',
      String(user.id)
    );
    logger.info('Privileged account created', { actorId: actor.id, newUserId: user.id, role });

    // Send account creation email with the temporary password
    try {
      await sendAccountCreatedEmail(email, name, finalPassword, role);
    } catch (emailErr) {
      logger.warn('Account creation email failed to send', {
        error: emailErr.message,
        email,
        role,
      });
    }

    return {
      id: String(user.id),
      name: user.name || '',
      email: user.email,
      role: user.role,
      isActive: Boolean(user.isActive),
      createdAt: user.createdAt,
    };
  }

  /**
   * Activates or deactivates an account. A Super Admin cannot be deactivated,
   * which would lock everyone out of the system.
   */
  static async setActive(actor, userId, isActive) {
    const prismaClient = getPrisma();

    const rows = await prismaClient.$queryRaw`
      SELECT id, role FROM users WHERE id = ${Number(userId)} LIMIT 1
    `;
    if (!rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Account not found.', 404);
    }
    if (rows[0].role === 'SUPER_ADMIN') {
      throw new AppError(
        AppErrorCodes.FORBIDDEN,
        'The Super Admin account cannot be deactivated.',
        403
      );
    }
    if (Number(rows[0].id) === Number(actor.id)) {
      throw new AppError(
        AppErrorCodes.FORBIDDEN,
        'You cannot deactivate your own account.',
        403
      );
    }

    await prismaClient.$executeRaw`
      UPDATE users SET isActive = ${isActive ? 1 : 0}, updatedAt = NOW(3) WHERE id = ${Number(userId)}
    `;

    // Deactivating must also end any live session for that account.
    if (!isActive) {
      await prismaClient.$executeRaw`
        UPDATE refresh_tokens SET revokedAt = NOW(3)
        WHERE userId = ${Number(userId)} AND revokedAt IS NULL
      `;
    }

    await AuthService.logAudit(
      String(actor.id),
      actor.role,
      isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      'User',
      String(userId)
    );
    logger.info('Account status changed', { actorId: actor.id, targetId: userId, isActive });

    return { id: String(userId), isActive };
  }
}

module.exports = { UserManagementService };
