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
    // The live `employee_profiles` table has no `designation` column (only
    // `designationId`), so the designation is read from the `employees` table
    // alone. Referencing `ep.designation` would make the whole query fail,
    // which is what produced the "Failed to load accounts" error.
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT u.id, u.name, u.email, u.role, u.isActive, u.createdAt, ' +
        'COALESCE(e.employeeCode, ep.employeeCode) AS employeeCode, ' +
        'e.designation AS designation, ' +
        'm.name AS reportingManagerName ' +
        'FROM users u ' +
        'LEFT JOIN employees e ON e.userId = u.id ' +
        'LEFT JOIN employee_profiles ep ON ep.userId = u.id ' +
        'LEFT JOIN employees m ON m.id = COALESCE(e.reportingManagerId, ep.reportingManagerId) ' +
        'WHERE u.role IN (' + placeholders + ') ORDER BY u.createdAt DESC',
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
      employeeCode: r.employeeCode || null,
      designation: r.designation || null,
      reportingManager: r.reportingManagerName || null,
    }));
  }

  /**
   * Creates an HR Admin, Employee or Super Admin account.
   */
  /**
   * Creates a user account and, for HR Admin and Employee roles, a linked
   * employee record.
   *
   * The Super Admin is a system user, not an employee: it never gets an
   * employee record or an employee code, so it is not provisionable through
   * this flow at all.
   *
   * The employee code is entered manually by the HR Admin — it is not
   * auto-generated, and it is not derived from or linked to the users-table
   * sequence. The code must be unique across all employees and, once set,
   * it cannot be changed.
   */
  static async create(actor, { name, email, password, role, employeeCode, designation, reportingManager }) {
    // Super Admin may only appoint HR Admin accounts — no Employee, no other
    // Super Admin. HR Admin in turn creates the Employee accounts.
    if (actor.role === 'SUPER_ADMIN' && role !== 'HR_ADMIN') {
      throw new AppError(
        AppErrorCodes.FORBIDDEN,
        'Super Admin can only create HR Admin accounts.',
        403
      );
    }
    if (actor.role === 'HR_ADMIN' && role !== 'EMPLOYEE') {
      throw new AppError(
        AppErrorCodes.FORBIDDEN,
        'HR Admin can only create Employee accounts.',
        403
      );
    }
    // The Super Admin is a system account, not an employee, and cannot be
    // minted by anyone through this flow.
    if (role === 'SUPER_ADMIN') {
      throw new AppError(
        AppErrorCodes.FORBIDDEN,
        'Super Admin accounts cannot be created through this flow.',
        403
      );
    }

    const prismaClient = getPrisma();

    // The employee code is mandatory and entered manually by the HR Admin.
    // It must not already be in use.
    const code = employeeCode && String(employeeCode).trim();
    if (!code) {
      throw new AppError(
        AppErrorCodes.VALIDATION_ERROR,
        'An employee code is required. Enter one manually — codes are not auto-generated.',
        400
      );
    }
    const dup = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM employees WHERE employeeCode = ? LIMIT 1',
      code
    );
    if (dup && dup.length) {
      throw new AppError(
        AppErrorCodes.DUPLICATE_ENTRY,
        'An employee with this code already exists.',
        409
      );
    }

    // Resolve the reporting manager against the employees table.
    let reportingManagerId = null;
    let reportingManagerName = null;
    if (reportingManager && String(reportingManager).trim()) {
      const mgrRows = await prismaClient.$queryRawUnsafe(
        'SELECT id, name FROM employees WHERE name = ? LIMIT 1',
        String(reportingManager).trim()
      );
      if (mgrRows && mgrRows.length) {
        reportingManagerId = Number(mgrRows[0].id);
        reportingManagerName = mgrRows[0].name;
      }
    }

    // An Employee must map to a higher person.
    if (role === 'EMPLOYEE' && !reportingManagerId) {
      throw new AppError(
        AppErrorCodes.VALIDATION_ERROR,
        'Every Employee must map to a higher person. Select a reporting manager.',
        400
      );
    }

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

    let finalPassword = password;
    if (!finalPassword) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      for (let i = 0; i < 12; i++) {
        finalPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    // The live employees table has NOT NULL designation, so a blank value
    // must fall back to a default rather than inserting NULL.
    const finalDesignation = (designation && String(designation).trim()) || 'Employee';
    const passwordHash = await hashPassword(finalPassword);

    const created = await prismaClient.$executeRaw`
      INSERT INTO users (name, email, passwordHash, role, isActive, createdAt, updatedAt)
      VALUES (${name}, ${email}, ${passwordHash}, ${role}, 1, NOW(3), NOW(3))
    `;

    const rows = await prismaClient.$queryRaw`
      SELECT id, name, email, role, isActive, createdAt FROM users WHERE email = ${email} LIMIT 1
    `;
    const user = rows[0];

    // Both HR Admin and Employee accounts get a linked employee record with
    // the manually-entered code above.
    //
    // deviceEnrollNo is a unique NOT NULL column in the live schema. It has
    // no meaning for an account-provisioned employee, so it is set to the
    // users-table id — which is unique by definition — rather than 0, which
    // would collide on the second insert.
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO employees
        (employeeCode, name, designation, joiningDate, deviceEnrollNo,
         basicSalary, allowances, deductions, isActive, userId,
         reportingManagerId, createdAt, updatedAt)
       VALUES (?, ?, ?, NOW(), ?, 0, 0, 0, 1, ?, ?, NOW(3), NOW(3))`,
      code, name, finalDesignation, Number(user.id), Number(user.id), reportingManagerId
    );

    await AuthService.logAudit(
      String(actor.id),
      actor.role,
      'CREATE_USER',
      'User',
      String(user.id)
    );
    logger.info('Privileged account created', {
      actorId: actor.id,
      newUserId: user.id,
      role,
      employeeCode: code,
    });

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
      employeeCode: code,
      designation: finalDesignation,
      reportingManager: reportingManagerName,
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
    // HR Admin can only toggle Employee accounts, not HR Admin or Super Admin
    if (actor.role === 'HR_ADMIN' && rows[0].role !== 'EMPLOYEE') {
      throw new AppError(
        AppErrorCodes.FORBIDDEN,
        'HR Admin can only manage Employee accounts.',
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
