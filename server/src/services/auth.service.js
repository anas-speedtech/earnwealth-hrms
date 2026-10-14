const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, Role } = require('../utils/jwt');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { logger } = require('../utils/logger');

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
    id: String(row.id),
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role === 'HR_MANAGER' ? 'HR' : row.role,
    status: row.isActive ? 'ACTIVE' : 'INACTIVE',
    name: row.name || null,
  };
}

/**
 * Safely creates a refresh token record.
 * The refresh_tokens table may not exist in all deployments.
 * Failure is logged but does not break login — the access token is still issued.
 */
async function safeCreateRefreshToken(prismaClient, userId, tokenHash, expiresAt) {
  try {
    // Raw SQL: the live users.id is an INT auto-increment, so the Prisma
    // model's String userId does not match this deployment.
    await prismaClient.$executeRaw`
      INSERT INTO refresh_tokens (id, userId, tokenHash, expiresAt)
      VALUES (UUID(), ${Number(userId)}, ${tokenHash}, ${expiresAt})
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
    const result = await prismaClient.$executeRaw`
      UPDATE refresh_tokens SET revokedAt = NOW()
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
      where: { id: userId },
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
    await prismaClient.auditLog.create({ data: { actorId, actorRole, action, entityType, entityId } });
  } catch (err) {
    logger.warn('Audit log write failed', { action, error: err.message });
  }
}

class AuthService {
  static async login({ email, password }) {
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
    await safeCreateRefreshToken(prismaClient, user.id, refreshTokenHash, expiresAt);

    // Step 7: Update last login timestamp (column may not exist — non-blocking)
    await safeUpdateLastLogin(prismaClient, user.id);

    // Step 8: Audit log (table may not exist — non-blocking)
    await safeAuditLog(prismaClient, user.id, user.role, 'LOGIN', 'User', user.id);

    logger.info('Login successful', { userId: user.id, email, role: user.role });

    return {
      user: { id: user.id, email: user.email, role: user.role },
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
    const rows = await prismaClient.$queryRaw`
      SELECT id, userId, tokenHash FROM refresh_tokens
      WHERE id = ${tokenId}
        AND revokedAt IS NULL
        AND expiresAt > NOW()
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
    user.role = user.role === 'HR_MANAGER' ? 'HR' : user.role;

    if (!user.isActive) {
      throw new AppError(AppErrorCodes.ACCOUNT_INACTIVE, 'Your account is no longer active.', 403);
    }

    await prismaClient.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

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

    await prismaClient.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newRefreshTokenHash,
        expiresAt,
      },
    });

    logger.info('Token refreshed', { userId: user.id });

    return { accessToken, refreshToken: newRefreshToken };
  }

  static async logout(tokenId) {
    const prismaClient = getPrisma();
    try {
      // Raw SQL: matches the live schema, where users.id is INT.
      await prismaClient.$executeRaw`
        UPDATE refresh_tokens SET revokedAt = NOW()
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
      SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND isActive = 1
    `;
    const hrStaffRows = await prismaClient.$queryRaw`
      SELECT COUNT(*) AS count FROM users WHERE role = 'HR_MANAGER' AND isActive = 1
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

    user.role = user.role === 'HR_MANAGER' ? 'HR' : user.role;

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

  static async requestPasswordReset(email) {
    const prismaClient = getPrisma();
    const user = await findUserByEmail(prismaClient, email);
    // Always return the same message so the endpoint cannot be used to
    // discover which email addresses have accounts.
    if (!user) {
      return { message: 'If an account exists, a reset link will be sent.' };
    }

    const rawToken = uuidv4();
    const tokenHash = await hashPassword(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    try {
      await prismaClient.$executeRaw`
        INSERT INTO password_reset_tokens (id, userId, tokenHash, expiresAt, used, createdAt)
        VALUES (UUID(), ${user.id}, ${tokenHash}, ${expiresAt}, 0, NOW())
      `;
    } catch (err) {
      // The table is absent in the deployed database. Log it and still return the
      // generic message rather than leaking the failure to the caller.
      logger.error('Failed to persist password reset token', { error: err.message });
      return { message: 'If an account exists, a reset link will be sent.' };
    }

    const { sendPasswordResetEmail } = require('./email.service');
    await sendPasswordResetEmail(user.email, rawToken);

    logger.info('Password reset token generated', { userId: user.id });
    return { message: 'If an account exists, a reset link will be sent.' };
  }

  static async resetPassword(rawToken, newPassword) {
    const prismaClient = getPrisma();

    let tokens;
    try {
      tokens = await prismaClient.$queryRaw`
        SELECT id, userId, tokenHash FROM password_reset_tokens
        WHERE used = 0 AND expiresAt > NOW()
      `;
    } catch (err) {
      logger.error('Failed to read password reset tokens', { error: err.message });
      throw new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'Invalid or expired reset token.', 400);
    }

    let matchedToken = null;
    for (const token of tokens) {
      if (await comparePassword(rawToken, String(token.tokenHash))) {
        matchedToken = token;
        break;
      }
    }

    if (!matchedToken) {
      throw new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'Invalid or expired reset token.', 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await prismaClient.$transaction([
      prismaClient.$executeRaw`
        UPDATE users SET passwordHash = ${passwordHash}, updatedAt = NOW() WHERE id = ${matchedToken.userId}
      `,
      prismaClient.$executeRaw`
        UPDATE password_reset_tokens SET used = 1, usedAt = NOW() WHERE id = ${matchedToken.id}
      `,
    ]);

    await AuthService.logAudit(String(matchedToken.userId), 'SYSTEM', 'PASSWORD_RESET', 'User', String(matchedToken.userId));
    logger.info('Password reset successful', { userId: matchedToken.userId });
    return { message: 'Password reset successful.' };
  }

  static async createInvitation(email, role, invitedBy) {
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
      data: { email, tokenHash, role, expiresAt },
    });

    await AuthService.logAudit(invitedBy, 'SYSTEM', 'CREATE_INVITATION', 'InvitationToken', email);
    logger.info('Invitation created', { email, role, invitedBy });

    return { token: rawToken };
  }

  static async acceptInvitation(rawToken, password) {
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
        data: { email: matchedToken.email, passwordHash, role: matchedToken.role, status: 'ACTIVE' },
      });

      switch (matchedToken.role) {
        case Role.SUPER_ADMIN:
          await tx.superAdminProfile.create({ data: { userId: user.id, fullName: user.email.split('@')[0] } });
          break;
        case Role.ADMIN:
          await tx.adminProfile.create({ data: { userId: user.id, fullName: user.email.split('@')[0] } });
          break;
        case Role.HR:
          await tx.hrProfile.create({ data: { userId: user.id, fullName: user.email.split('@')[0] } });
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
  }

  static async logAudit(actorId, actorRole, action, entityType, entityId) {
    try {
      const prismaClient = getPrisma();
      await prismaClient.auditLog.create({ data: { actorId, actorRole, action, entityType, entityId } });
    } catch {
      logger.error('Failed to write audit log', { action, entityType, entityId });
    }
  }
}

module.exports = { AuthService, setupTestPrisma, resetPrisma };
