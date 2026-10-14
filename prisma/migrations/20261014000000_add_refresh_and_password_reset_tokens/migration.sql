-- EWS HRMS — surgical migration
-- Adds only the two tables required for single-session enforcement (#4)
-- and password-reset-by-email (#6). Nothing else is created, altered, or dropped.
--
-- This deliberately does NOT run `prisma db push`. The live `users` table
-- differs from schema.prisma (int auto-increment id, `name`, `isActive`,
-- and a role enum containing HR_MANAGER), so a full push would recreate
-- `users` and destroy the existing Super Admin account.
--
-- Foreign keys therefore target the LIVE shape: users.id is INT(11).

SET NAMES utf8mb4;

-- Refresh tokens: one row per issued session. A second login for the same
-- user can be detected and the previous sessions revoked here.
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id`         VARCHAR(191) NOT NULL,
  `userId`     INT(11)      NOT NULL,
  `tokenHash`  VARCHAR(255) NOT NULL,
  `expiresAt`  DATETIME(3)  NOT NULL,
  `revokedAt`  DATETIME(3)  NULL,
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `refresh_tokens_userId_idx` (`userId`),
  KEY `refresh_tokens_tokenHash_idx` (`tokenHash`),
  CONSTRAINT `refresh_tokens_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Password reset tokens: stores only the bcrypt hash of the emailed token,
-- never the token itself. Expiry is enforced by the application (1 hour).
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id`         VARCHAR(191) NOT NULL,
  `userId`     INT(11)      NOT NULL,
  `tokenHash`  VARCHAR(255) NOT NULL,
  `expiresAt`  DATETIME(3)  NOT NULL,
  `used`       TINYINT(1)   NOT NULL DEFAULT 0,
  `usedAt`     DATETIME(3)  NULL,
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `password_reset_tokens_userId_idx` (`userId`),
  KEY `password_reset_tokens_tokenHash_idx` (`tokenHash`),
  CONSTRAINT `password_reset_tokens_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
