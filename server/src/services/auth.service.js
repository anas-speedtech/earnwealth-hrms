const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { hashPassword, comparePassword } = require('../utils/password');
const {
  signAccessToken,
  signRefreshToken,
  signPasswordResetVerifyToken,
  verifyPasswordResetVerifyToken,
  Role,
} = require('../utils/jwt');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { logger } = require('../utils/logger');

// Password reset OTP settings.
const OTP_EXPIRY_MINUTES = 5;

/**
 * A 6-digit one-time code, generated with a cryptographic source so it cannot
 * be predicted from previous codes.
 */
function generateOtp() {
  const value = crypto.randomInt(0, 1000000);
  return String(value).padStart(6, '0');
}

/**
 * Some role profile rows predate the current schema and are optional: a user
 * must still be able to accept an invitation even when the profile row cannot
 * be created, so failures are logged and ignored.
 */
async function createOptionalProfile(create) {
  try {
    await create();
  } catch (err) {
    logger.warn('Optional role profile not created', {
      error: err.message,
    });
  }
}

let _prisma;

function getPrisma() {
  if (!_prisma) {
    try {
      const { PrismaClient } = require('@prisma/client');
      _prisma = new PrismaClient({
        log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    } catch (err) {
      throw new Error('Prisma client not generated. Run: npx prisma generate');
    }
  }
  return _prisma;
}

// Allows tests to inject a mock PrismaClient so no real DB connection is needed.
// Also clears any cached real instance so the mock is used on the next getPrisma() call.
function setupTestPrisma(mockInstance) {
  _prisma = null;   // clear real cached instance first
  _prisma = mockInstance;
}

// Clears the cached Prisma instance (used in tests between re-loads).
function resetPrisma() {
  _prisma = null;
}

/**
 * Reads a user row using raw SQL compatible with the deployed database schema.
 * Uses Prisma's parameterized $queryRaw to prevent SQL injection.
 * Maps legacy column names (isActive) to application-level fields (status).
 * Returns null if the user is not found.
 */
async function findUserByEmail(prismaClient, email) {
  const rows = await prismaClient.$queryRaw`
    SELECT id, name, email, passwordHash, role, isActive, createdAt, updatedAt
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  return {
    id: Number(row.id), // live table: INT auto-increment
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role === 'HR_ADMIN' ? 'HR_ADMIN' : row.role,
    status: row.isActive ? 'ACTIVE' : 'INACTIVE',
    name: row.name || null,
  };
}

/**
 * Safely creates a refresh token record.
 * The refresh_tokens table may not exist in all deployments.
 * Failure is logged but does not break login — the access token is still issued.
 */
async function safeCreateRefreshToken(prismaClient, userId, tokenId, tokenHash, expiresAt) {
  try {
    // Raw SQL: the live users.id is an INT auto-increment, so the Prisma
    // model's String userId does not match this deployment.
    //
    // The id MUST be the tokenId embedded in the refresh JWT. Generating a
    // separate id here (UUID()) would make the row unfindable on refresh,
    // since refresh() looks it up by that tokenId.
    await prismaClient.$executeRaw`
      INSERT INTO refresh_tokens (id, userId, tokenHash, expiresAt)
      VALUES (${tokenId}, ${Number(userId)}, ${tokenHash}, ${expiresAt})
    `;
  } catch (err) {
    logger.warn('Refresh token persistence unavailable', { error: err.message });
  }
}

/**
 * Revokes every unrevoked refresh token for a user, so only the newest
 * session stays valid. Non-blocking if the table is absent.
 */
async function safeRevokeExistingSessions(prismaClient, userId) {
  try {
    const now = new Date();
    const result = await prismaClient.$executeRaw`
      UPDATE refresh_tokens SET revokedAt = ${now}
      WHERE userId = ${Number(userId)} AND revokedAt IS NULL
    `;
    if (result > 0) {
      logger.info('Revoked previous sessions for single-session policy', {
        userId,
        revoked: result,
      });
    }
  } catch (err) {
    logger.warn('Session revocation unavailable', { error: err.message });
  }
}

/**
 * Safely updates lastLoginAt on the user record.
 * The column may not exist in all deployments.
 */
async function safeUpdateLastLogin(prismaClient, userId) {
  try {
    await prismaClient.user.update({
      where: { id: Number(userId) },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    logger.warn('Could not update last login timestamp', { error: err.message });
  }
}

/**
 * Safely creates an audit log entry.
 * The audit_logs table may not exist in all deployments.
 */
async function safeAuditLog(prismaClient, actorId, actorRole, action, entityType, entityId) {
  try {
    await prismaClient.auditLog.create({
      data: {
        actorId: actorId === null || actorId === undefined ? null : String(actorId),
        actorRole, action, entityType,
        entityId: entityId === null || entityId === undefined ? null : String(entityId),
      },
    });
  } catch (err) {
    logger.warn('Audit log write failed', { action, error: err.message });
  }
}

class AuthService {
  static async login({ email, password, expectedRole }) {
    const prismaClient = getPrisma();

    // Step 1: Look up user using schema-compatible raw query
    const user = await findUserByEmail(prismaClient, email);
    if (!user) {
      logger.warn('Login failed: user not found', { email });
      throw new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials.', 401);
    }

    // Step 2: Check account status (mapped from isActive)
    if (user.status === 'SUSPENDED') {
      logger.warn('Login failed: account suspended', { userId: user.id });
      throw new AppError(AppErrorCodes.ACCOUNT_INACTIVE, 'Your account has been suspended.', 403);
    }
    if (user.status === 'INACTIVE') {
      logger.warn('Login failed: account inactive', { userId: user.id });
      throw new AppError(AppErrorCodes.ACCOUNT_INACTIVE, 'Your account is inactive.', 403);
    }

    // Step 2b: Reject an account signing in through the wrong role's login
    // page. The role always comes from the database record, never from the
    // request, so changing the URL or the request body cannot change it. The
    // message is deliberately generic: it must not reveal that the account
    // exists under a different role.
    // Normalize both sides so 'HR_ADMIN' is treated as equivalent.
    // user.role is already mapped by findUserByEmail; normalize expectedRole too.
    const normalizedExpected = expectedRole === 'HR_ADMIN' ? 'HR_ADMIN' : expectedRole;
    if (expectedRole && user.role !== normalizedExpected) {
      logger.warn('Login blocked: role mismatch', { userId: user.id, expectedRole });
      throw new AppError(
        AppErrorCodes.INVALID_CREDENTIALS,
        'Invalid credentials. This account cannot sign in from this page.',
        401
      );
    }

    // Step 3: Verify password hash — never bypassed
    const passwordValid = await comparePassword(password, user.passwordHash);
    if (!passwordValid) {
      logger.warn('Login failed: invalid password', { userId: user.id });
      throw new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials.', 401);
    }

    // Step 4: Issue tokens
    const tokenId = uuidv4();
    const accessToken = signAccessToken({ userId: user.id, role: user.role, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, tokenId });

    const refreshTokenHash = await hashPassword(refreshToken);
    const expiresAt = new Date();
    const expiryMs = env.JWT_REFRESH_EXPIRY === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : parseInt(env.JWT_REFRESH_EXPIRY) * 1000;
    expiresAt.setMilliseconds(expiresAt.getMilliseconds() + expiryMs);

    // Step 5: Enforce one active session per account by revoking every
    // existing refresh token for this user before issuing the new one.
    // A login from a second machine therefore ends the first session on
    // its next refresh attempt.
    await safeRevokeExistingSessions(prismaClient, user.id);

    // Step 6: Persist the new refresh token
    await safeCreateRefreshToken(
      prismaClient,
      user.id,
      tokenId,
      refreshTokenHash,
      expiresAt,
    );

    // Step 7: Update last login timestamp (column may not exist — non-blocking)
    await safeUpdateLastLogin(prismaClient, user.id);

    // Step 8: Audit log (table may not exist — non-blocking)
    await safeAuditLog(prismaClient, user.id, user.role, 'LOGIN', 'User', user.id);

    logger.info('Login successful', { userId: user.id, email, role: user.role });

    // An HR Admin is also an employee, so attach the linked employee record
    // (designation, reporting manager) when one exists. This lets the client
    // show "my details as an employee" without a separate lookup.
    let employee = null;
    try {
      const empRows = await prismaClient.$queryRaw`
        SELECT e.id, e.employeeCode, e.designation,
               e.reportingManagerId, m.name AS reportingManagerName
        FROM employees e
        LEFT JOIN employees m ON m.id = e.reportingManagerId
        WHERE e.userId = ${Number(user.id)}
        LIMIT 1
      `;
      if (empRows && empRows.length) {
        const row = empRows[0];
        employee = {
          id: String(row.id),
          employeeCode: row.employeeCode || '',
          designation: row.designation ? { id: '', name: row.designation } : null,
          manager: row.reportingManagerId
            ? { id: String(row.reportingManagerId), name: row.reportingManagerName || '' }
            : null,
        };
      }
    } catch {
      // The employees table may be absent; the login still succeeds.
      employee = null;
    }

    return {
      user: { id: user.id, email: user.email, role: user.role, employee },
      accessToken,
      refreshToken,
    };
  }

  static async refresh(tokenId, rawToken) {
    const prismaClient = getPrisma();

    // The refresh_tokens table may not exist in all deployments.
    // Without persistent storage, we cannot validate a refresh token securely,
    // so we require the user to log in again.
    try {
      await prismaClient.$queryRawUnsafe('SELECT 1 FROM refresh_tokens LIMIT 1');
    } catch {
      throw new AppError(
        AppErrorCodes.TOKEN_INVALID,
        'Session persistence is unavailable. Please log in again.',
        401,
      );
    }

    // Raw SQL: users.id is INT in this deployment, so the Prisma model's
    // String-typed userId does not match. revokedAt is honoured here, which is
    // what makes the one-session-per-account policy effective.
    //
    // The expiry is compared against a value supplied by the application, not
    // MySQL's NOW(): the database session timezone differs from the machine's,
    // so NOW() would make freshly issued tokens look expired.
    const now = new Date();
    const rows = await prismaClient.$queryRaw`
      SELECT id, userId, tokenHash FROM refresh_tokens
      WHERE id = ${tokenId}
        AND revokedAt IS NULL
        AND expiresAt > ${now}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      throw new AppError(AppErrorCodes.TOKEN_INVALID, 'Invalid or expired refresh token.', 401);
    }

    const storedToken = rows[0];
    const valid = await comparePassword(rawToken, String(storedToken.tokenHash));
    if (!valid) {
      logger.warn('Refresh token mismatch', { tokenId });
      throw new AppError(AppErrorCodes.TOKEN_INVALID, 'Invalid refresh token.', 401);
    }

    // Fetch current user status using raw query for schema compatibility
    const userRows = await prismaClient.$queryRaw`
      SELECT id, email, role, isActive FROM users WHERE id = ${storedToken.userId} LIMIT 1
    `;
    if (!userRows || userRows.length === 0) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'User not found.', 404);
    }
    const user = userRows[0];
    user.role = user.role === 'HR_ADMIN' ? 'HR_ADMIN' : user.role;

    if (!user.isActive) {
      throw new AppError(AppErrorCodes.ACCOUNT_INACTIVE, 'Your account is no longer active.', 403);
    }

    // Rotate: revoke the used token, then issue a fresh pair. Raw SQL so the
    // lookup matches the live schema.
    await prismaClient.$executeRaw`
      UPDATE refresh_tokens SET revokedAt = NOW(3) WHERE id = ${storedToken.id}
    `;

    const newTokenId = uuidv4();
    const accessToken = signAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });
    const newRefreshToken = signRefreshToken({
      userId: user.id,
      tokenId: newTokenId,
    });

    const newRefreshTokenHash = await hashPassword(newRefreshToken);
    const expiresAt = new Date();
    const expiryMs = env.JWT_REFRESH_EXPIRY === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : parseInt(env.JWT_REFRESH_EXPIRY) * 1000;
    expiresAt.setMilliseconds(expiresAt.getMilliseconds() + expiryMs);

    await safeCreateRefreshToken(
      prismaClient,
      user.id,
      newTokenId,
      newRefreshTokenHash,
      expiresAt,
    );

    logger.info('Token refreshed', { userId: user.id });

    return { accessToken, refreshToken: newRefreshToken };
  }

  static async logout(tokenId) {
    const prismaClient = getPrisma();
    try {
      // Raw SQL: matches the live schema, where users.id is INT.
      const now = new Date();
      await prismaClient.$executeRaw`
        UPDATE refresh_tokens SET revokedAt = ${now}
        WHERE id = ${tokenId} AND revokedAt IS NULL
      `;
    } catch (err) {
      logger.warn('Logout revocation unavailable', { error: err.message });
    }
    logger.info('User logged out', { tokenId });
  }

  static async getSuperAdminStats() {
    const prismaClient = getPrisma();

    const totalEmployeesRows = await prismaClient.$queryRaw`
      SELECT COUNT(*) AS count FROM employees WHERE isActive = 1
    `;
    const activeAdminsRows = await prismaClient.$queryRaw`
      SELECT COUNT(*) AS count FROM users WHERE role = 'SUPER_ADMIN' AND isActive = 1
    `;
    const hrStaffRows = await prismaClient.$queryRaw`
      SELECT COUNT(*) AS count FROM users WHERE role = 'HR_ADMIN' AND isActive = 1
    `;
    const pendingApprovalsRows = await prismaClient.$queryRaw`
      SELECT COUNT(*) AS count FROM leaves WHERE status = 'PENDING'
    `;

    const getNumber = (rows) => (rows && rows[0] ? Number(rows[0].count) : 0);

    return {
      totalEmployees: getNumber(totalEmployeesRows),
      activeAdmins: getNumber(activeAdminsRows),
      hrStaff: getNumber(hrStaffRows),
      pendingApprovals: getNumber(pendingApprovalsRows),
    };
  }

  static async getMe(userId) {
    const prismaClient = getPrisma();

    // Use raw query compatible with deployed schema
    const rows = await prismaClient.$queryRaw`
      SELECT id, name, email, role, isActive, createdAt FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (!rows || rows.length === 0) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'User not found.', 404);
    }
    const user = rows[0];

    user.role = user.role === 'HR_ADMIN' ? 'HR_ADMIN' : user.role;

    const profile = {
      name: user.name || '',
      fullName: user.name || '',
    };

    return {
      id: String(user.id),
      email: user.email,
      role: user.role,
      profile,
    };
  }

  /**
   * Step 1 of password reset: issues a 6-digit OTP and emails it.
   *
   * Returns the same message whether or not the address exists, so this
   * endpoint cannot be used to discover which accounts are real.
   */
  static async requestPasswordReset(email) {
    const prismaClient = getPrisma();
    const user = await findUserByEmail(prismaClient, email);
    // Always return the same message so the endpoint cannot be used to
    // discover which email addresses have accounts.
    if (!user) {
      return { message: 'If an account exists, a code has been sent.' };
    }

    // Without SMTP the code cannot be delivered, so do not create one that
    // nobody can use. Reporting the outage honestly is better than telling
    // the user an email was sent when it was not.
    if (!env.PASSWORD_RESET_ENABLED) {
      logger.error('Password reset requested but SMTP is not configured', { userId: user.id });
      throw new AppError(
        AppErrorCodes.INTERNAL_ERROR,
        'Password reset by email is not available. Please contact your administrator to reset your password.',
        503,
      );
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    const now = new Date();
    try {
      // A new request invalidates any earlier code for this account, so only
      // the most recently sent OTP can ever be used.
      await prismaClient.$executeRaw`
        UPDATE password_reset_tokens
        SET used = 1, usedAt = ${now}
        WHERE userId = ${Number(user.id)} AND used = 0
      `;

      await prismaClient.$executeRaw`
        INSERT INTO password_reset_tokens (id, userId, tokenHash, expiresAt, used, createdAt)
        VALUES (UUID(), ${Number(user.id)}, ${otpHash}, ${expiresAt}, 0, ${now})
      `;
    } catch (err) {
      logger.error('Failed to persist password reset OTP', { error: err.message });
      throw new AppError(
        AppErrorCodes.INTERNAL_ERROR,
        'Password reset is temporarily unavailable. Please try again shortly.',
        503,
      );
    }

    const { sendPasswordResetOtp } = require('./email.service');
    await sendPasswordResetOtp(user.email, otp, OTP_EXPIRY_MINUTES);

    logger.info('Password reset OTP generated', { userId: user.id });
    return { message: 'If an account exists, a code has been sent.' };
  }

  /**
   * Step 2: verifies the OTP and, if correct, returns a short-lived
   * verification token that authorises the password change in step 3.
   *
   * The token is deliberately useless on its own: it carries no user id, so
   * it cannot be replayed against another account.
   */
  static async verifyPasswordResetOtp(email, otp) {
    const prismaClient = getPrisma();
    const user = await findUserByEmail(prismaClient, email);

    // Same error either way, so this endpoint cannot confirm which
    // addresses have accounts.
    if (!user) {
      throw new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'That code is not valid.', 400);
    }

    // Expiry is compared against a value supplied by the application rather
    // than MySQL's NOW(): the database session timezone differs from the
    // machine's, so NOW() makes a just-issued code look already expired.
    const now = new Date();
    let candidates;
    try {
      candidates = await prismaClient.$queryRaw`
        SELECT id, tokenHash FROM password_reset_tokens
        WHERE userId = ${Number(user.id)} AND used = 0 AND expiresAt > ${now}
        ORDER BY createdAt DESC
      `;
    } catch (err) {
      logger.error('Failed to read password reset OTP', { error: err.message });
      throw new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'That code is not valid.', 400);
    }

    // The OTP is stored as a bcrypt hash, so each candidate must be compared
    // rather than looked up directly.
    let matched = null;
    for (const row of candidates) {
      if (await comparePassword(otp, String(row.tokenHash))) {
        matched = row;
        break;
      }
    }

    if (!matched) {
      throw new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'That code is not valid.', 400);
    }

    // Burn the OTP immediately: single use, so it cannot be replayed even
    // though the verification token remains valid for a short window.
    await prismaClient.$executeRaw`
      UPDATE password_reset_tokens
      SET used = 1, usedAt = ${now}
      WHERE id = ${matched.id}
    `;

    const verifyToken = signPasswordResetVerifyToken({
      userId: user.id,
      resetId: matched.id,
    });

    logger.info('Password reset OTP verified', { userId: user.id });
    return { verifyToken };
  }

  /**
   * Step 3: sets the new password using the verification token from step 2.
   */
  static async resetPassword(verifyToken, newPassword) {
    const prismaClient = getPrisma();

    let decoded;
    try {
      decoded = verifyPasswordResetVerifyToken(verifyToken);
    } catch {
      throw new AppError(
        AppErrorCodes.INVALID_CREDENTIALS,
        'Your verification has expired. Please start the reset again.',
        400,
      );
    }

    // The OTP must have been consumed for this account, which is what proves
    // the user owns the inbox.
    const rows = await prismaClient.$queryRaw`
      SELECT id, userId FROM password_reset_tokens
      WHERE id = ${decoded.resetId} AND userId = ${Number(decoded.userId)} AND used = 1
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      throw new AppError(
        AppErrorCodes.INVALID_CREDENTIALS,
        'Your verification is no longer valid. Please start the reset again.',
        400,
      );
    }

    const passwordHash = await hashPassword(newPassword);

    const now = new Date();
    await prismaClient.$transaction([
      prismaClient.$executeRaw`
        UPDATE users SET passwordHash = ${passwordHash}, updatedAt = ${now} WHERE id = ${Number(decoded.userId)}
      `,
    ]);

    // The password changed, so every existing session must end. Otherwise a
    // stolen refresh token would keep working after the reset.
    await safeRevokeExistingSessions(prismaClient, decoded.userId);

    await AuthService.logAudit(String(decoded.userId), 'SYSTEM', 'PASSWORD_RESET', 'User', String(decoded.userId));
    logger.info('Password reset successful', { userId: decoded.userId });
    return { message: 'Password reset successful.' };
  }

  static async createInvitation(email, role, invitedBy, name) {
    // Nobody may mint a Super Admin account through the invitation flow,
    // including a Super Admin. This is enforced at the route schema too; the
    // guard here is the authoritative block so no future caller can bypass it.
    if (role === Role.SUPER_ADMIN) {
      throw new AppError(
        AppErrorCodes.FORBIDDEN,
        'Super Admin accounts cannot be created through an invitation.',
        403
      );
    }

    const prismaClient = getPrisma();

    const existing = await prismaClient.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'An account with this email already exists.', 409);
    }

    const rawToken = uuidv4();
    const tokenHash = await hashPassword(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prismaClient.invitationToken.create({
      data: { email, name, tokenHash, role, expiresAt },
    });

    await AuthService.logAudit(invitedBy, 'SYSTEM', 'CREATE_INVITATION', 'InvitationToken', email);

    // Deliver the invitation to the exact email saved on the new account. A
    // delivery problem must never fail the invitation itself.
    let invitationEmailSent = false;
    try {
      const { sendInvitationEmail } = require('./email.service');
      const emailResult = await sendInvitationEmail(email, rawToken, role);
      invitationEmailSent = emailResult.sent === true;
    } catch (emailErr) {
      logger.warn('Invitation email delivery failed', {
        error: emailErr.message,
        email,
        role,
      });
    }

    logger.info('Invitation created', {
      email,
      role,
      invitedBy,
      emailSent: invitationEmailSent,
    });

    return { token: rawToken, sent: invitationEmailSent };
  }

  static async acceptInvitation(rawToken, password) {
    try {
      const prismaClient = getPrisma();

      const tokens = await prismaClient.invitationToken.findMany({
        where: { used: false, expiresAt: { gt: new Date() } },
      });

      let matchedToken = null;
      for (const token of tokens) {
        if (await comparePassword(rawToken, token.tokenHash)) {
          matchedToken = token;
          break;
        }
      }

      if (!matchedToken) {
        throw new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'Invalid or expired invitation.', 400);
      }

      const passwordHash = await hashPassword(password);

      const result = await prismaClient.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: matchedToken.email,
            name: matchedToken.name || matchedToken.email.split('@')[0],
            passwordHash,
            role: matchedToken.role,
            isActive: true,
          },
        });

        switch (matchedToken.role) {
          case Role.SUPER_ADMIN:
            await createOptionalProfile(() =>
              tx.superAdminProfile.create({
                data: { userId: user.id, fullName: user.email.split('@')[0] },
              })
            );
            break;
          case Role.HR_ADMIN:
            await createOptionalProfile(() =>
              tx.adminProfile.create({
                data: { userId: user.id, fullName: user.email.split('@')[0] },
              })
            );
            break;
          case Role.EMPLOYEE:
            await tx.employeeProfile.create({
              data: {
                userId: user.id,
                employeeCode: `EMP-${Date.now().toString(36).toUpperCase()}`,
                firstName: '',
                lastName: '',
                employmentType: 'FULL_TIME',
              },
            });
            break;
        }

        await tx.invitationToken.update({
          where: { id: matchedToken.id },
          data: { used: true, usedAt: new Date() },
        });

        return user;
      });

      logger.info('Invitation accepted', { userId: result.id, email: result.email, role: result.role });
      return { message: 'Account created successfully.' };
    } catch (err) {
      logger.error('acceptInvitation failed:', { error: err.message, stack: err.stack });
      throw err;
    }
  }

  static async logAudit(actorId, actorRole, action, entityType, entityId) {
    try {
      const prismaClient = getPrisma();
      await prismaClient.auditLog.create({
      data: {
        actorId: actorId === null || actorId === undefined ? null : String(actorId),
        actorRole, action, entityType,
        entityId: entityId === null || entityId === undefined ? null : String(entityId),
      },
    });
    } catch {
      logger.error('Failed to write audit log', { action, entityType, entityId });
    }
  }
}

module.exports = { AuthService, getPrisma, setupTestPrisma, resetPrisma };
