/**
 * Creates the comp-off tables, which were declared in the Prisma schema but
 * never actually migrated to the live database.
 *
 * Uses IF NOT EXISTS throughout, so it is safe to re-run and will not touch
 * anything that already exists.
 *
 * Usage: node migrate-compoff.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;

const p = new PrismaClient({ datasources: { db: { url } } });

const SQL = `
CREATE TABLE IF NOT EXISTS comp_off_credits (
  id         varchar(191) NOT NULL,
  employeeId int(11)      NOT NULL,
  sourceDate date         NOT NULL,
  earnedDays decimal(5,2) NOT NULL DEFAULT 1.00,
  usedDays   decimal(5,2) NOT NULL DEFAULT 0.00,
  status     varchar(20)  NOT NULL DEFAULT 'AVAILABLE',
  expiresAt  date         NOT NULL,
  reason     varchar(500) DEFAULT NULL,
  approvedBy varchar(191) DEFAULT NULL,
  approvedAt datetime(3)  DEFAULT NULL,
  createdAt  datetime(3)  NOT NULL DEFAULT current_timestamp(3),
  updatedAt  datetime(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY comp_off_credits_employeeId_sourceDate_key (employeeId, sourceDate),
  KEY comp_off_credits_employeeId_idx (employeeId),
  CONSTRAINT comp_off_credits_employeeId_fkey
    FOREIGN KEY (employeeId) REFERENCES employees (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS comp_off_ledger (
  id           varchar(191) NOT NULL,
  creditId     varchar(191) NOT NULL,
  employeeId   int(11)      NOT NULL,
  type         varchar(20)  NOT NULL,
  amount       decimal(5,2) NOT NULL,
  balanceAfter decimal(5,2) NOT NULL,
  note         varchar(255) DEFAULT NULL,
  createdAt    datetime(3)  NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (id),
  KEY comp_off_ledger_creditId_idx (creditId),
  KEY comp_off_ledger_employeeId_idx (employeeId),
  CONSTRAINT comp_off_ledger_creditId_fkey
    FOREIGN KEY (creditId) REFERENCES comp_off_credits (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT comp_off_ledger_employeeId_fkey
    FOREIGN KEY (employeeId) REFERENCES employees (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS comp_off_policy (
  id               varchar(191) NOT NULL,
  expiryMonths     int(11)      NOT NULL DEFAULT 3,
  minWorkedHours   decimal(4,2) NOT NULL DEFAULT 4.00,
  maxDaysPerMonth  int(11)      NOT NULL DEFAULT 2,
  isActive         tinyint(1)   NOT NULL DEFAULT 1,
  createdAt        datetime(3)  NOT NULL DEFAULT current_timestamp(3),
  updatedAt        datetime(3)  NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
`;

(async () => {
  // Split on the semicolon that terminates each statement, ignoring the
  // trailing empty fragment.
  const statements = SQL.split(';').map((s) => s.trim()).filter(Boolean);

  for (const statement of statements) {
    await p.$executeRawUnsafe(statement);
  }
  console.log('comp-off tables created');

  // The comp-off service reads a single active policy and creates a default if
  // none exists, but creating it here means the module works on first load.
  const existing = await p.$queryRawUnsafe(
    "SELECT id FROM comp_off_policy WHERE isActive = 1 LIMIT 1"
  );
  if (!existing.length) {
    const { randomUUID } = require('crypto');
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await p.$executeRawUnsafe(
      'INSERT INTO comp_off_policy (id, expiryMonths, minWorkedHours, maxDaysPerMonth, isActive, createdAt, updatedAt) ' +
      "VALUES ('" + randomUUID() + "', 3, 4.00, 2, 1, '" + now + "', '" + now + "')"
    );
    console.log('default comp-off policy created');
  } else {
    console.log('comp-off policy already present');
  }

  await p.$disconnect();
})().catch((e) => {
  console.error('ERR: ' + e.message);
  process.exit(1);
});
