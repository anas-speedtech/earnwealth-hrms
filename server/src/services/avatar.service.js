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

/**
 * Profile avatars, stored in the database rather than on the filesystem.
 *
 * Why not disk uploads:
 *  - The UAT/Production boxes are Ubuntu + an nginx reverse proxy that only
 *    forwards /api to the app. A static /uploads path would need an extra
 *    nginx location, read permissions, and identical directory layout on
 *    every box — exactly the "struggle" this avoids.
 *  - The table is created idempotently (same ensure-table pattern as
 *    salary_rules, payout_details, employee_personal_profiles), so moving to
 *    UAT/Production needs zero migration or filesystem step; the image lives
 *    in MySQL alongside the rest of the record and rides DB backups.
 *  - Images are always served through the authenticated API
 *    (GET /me/avatar → base64 JSON), so a wrong nginx path or permission
 *    issue can never break display.
 *
 * The client pre-compresses photos to roughly 250–300 KB, which keeps the
 * JSON request well inside the app's 1 MB body limit and the BLOB tiny.
 */
class AvatarService {
  static ensureTable(prismaClient) {
    return prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_avatars (
        userId    INT(11)      NOT NULL,
        mimeType  VARCHAR(10)  NOT NULL DEFAULT 'image/jpeg',
        data      LONGBLOB     NOT NULL,
        updatedAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        createdAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  // ---- input handling ----

  static ALLOWED_MIME = {
    'image/jpeg': 1,
    'image/png': 1,
    'image/webp': 1,
    'image/gif': 1,
  };

  /**
   * Accepts a base64 data URL (client sends the compressed photo as
   * `data:image/jpeg;base64,....`). Returns the raw bytes + mime type.
   */
  static parseImage(input) {
    const raw = String(input || '').trim();
    if (!raw) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'No avatar image was provided.', 400);
    }
    const match = raw.match(/^data:(image\/(jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) {
      throw new AppError(
        AppErrorCodes.VALIDATION_ERROR,
        'Avatar must be a base64 data URL (jpeg, png, webp or gif).',
        400
      );
    }
    const mime = `image/${match[2]}`;
    if (!AvatarService.ALLOWED_MIME[mime]) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unsupported avatar image type.', 400);
    }
    const buffer = Buffer.from(match[3], 'base64');
    // Generous cap: the client compresses to ~300 KB, so this only guards
    // against a hand-crafted request. Stays far below MySQL's
    // max_allowed_packet concerns and the 1 MB JSON body limit.
    if (buffer.length > 1024 * 1024) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Avatar image is too large.', 400);
    }
    return { mime, buffer };
  }

  // ---- write ----

  static async set(reqUser, image) {
    const prismaClient = getPrisma();
    await AvatarService.ensureTable(prismaClient);
    const { mime, buffer } = AvatarService.parseImage(image);

    await prismaClient.$executeRawUnsafe(
      `INSERT INTO user_avatars (userId, mimeType, data, createdAt, updatedAt)
       VALUES (?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE mimeType = VALUES(mimeType), data = VALUES(data)`,
      Number(reqUser.id),
      mime,
      buffer
    );

    logger.info('Avatar saved', { userId: reqUser.id, bytes: buffer.length });
    return AvatarService.get(reqUser.id);
  }

  static async remove(reqUser) {
    const prismaClient = getPrisma();
    await AvatarService.ensureTable(prismaClient);
    await prismaClient.$executeRawUnsafe('DELETE FROM user_avatars WHERE userId = ?', Number(reqUser.id));
    return { removed: true };
  }

  // ---- read ----

  /** The avatar for a user id as `{ mimeType, data (base64), updatedAt }` or null. */
  static async get(userId) {
    const prismaClient = getPrisma();
    await AvatarService.ensureTable(prismaClient);
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT mimeType, data, updatedAt FROM user_avatars WHERE userId = ? LIMIT 1',
      Number(userId)
    );
    if (!rows || !rows.length) return null;
    const r = rows[0];
    return {
      mimeType: r.mimeType,
      data: Buffer.from(r.data).toString('base64'),
      updatedAt: r.updatedAt,
    };
  }

  /** HR Admin / Super Admin can view any user's photo (employee directory). */
  static async getForAdmin(reqUser, targetUserId) {
    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot view other users avatars.', 403);
    }
    return AvatarService.get(targetUserId);
  }
}

module.exports = { AvatarService };
