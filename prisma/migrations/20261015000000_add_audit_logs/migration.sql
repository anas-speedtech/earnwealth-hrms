-- EWS HRMS — surgical migration
-- Adds only the audit_logs table, so sensitive actions (login, password reset,
-- account creation, role changes, approvals) can be recorded as required.
-- Nothing else is created, altered, or dropped.
--
-- This deliberately does NOT run `prisma db push`. The live `users` table
-- differs from schema.prisma (int auto-increment id, `name`, `isActive`,
-- and a role enum containing HR_MANAGER), so a full push would recreate
-- `users` and destroy the existing Super Admin account.
--
-- actorId therefore follows the LIVE shape: users.id is INT(11). The Prisma
-- schema types it as a String uuid, which would not bind to the real column.
--
-- The audit code writes through Prisma's model, so this table is created with
-- the column names and types that model expects, adapted to the live users.id.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`         VARCHAR(191) NOT NULL,
  -- Nullable and no foreign key: an audit row must survive its actor being
  -- deleted, and the value is stored as the live INT id.
  `actorId`    VARCHAR(191) NULL,
  `actorRole`  VARCHAR(191) NOT NULL,
  `action`     VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId`   VARCHAR(191) NOT NULL,
  `beforeValue` TEXT        NULL,
  `afterValue`  TEXT        NULL,
  -- The generated Prisma client selects `metadata` on AuditLog even though the
  -- current schema.prisma does not declare it, so the column is created to keep
  -- the client and the database in agreement. Nullable: no code writes to it.
  `metadata`    TEXT        NULL,
  `ipAddress`  VARCHAR(191) NULL,
  `userAgent`  VARCHAR(191) NULL,
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `audit_logs_actorId_createdAt_idx` (`actorId`, `createdAt`),
  KEY `audit_logs_entityType_entityId_idx` (`entityType`, `entityId`),
  KEY `audit_logs_action_idx` (`action`),
  KEY `audit_logs_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
