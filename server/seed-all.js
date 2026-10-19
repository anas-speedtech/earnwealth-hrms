/**
 * Comprehensive seed — creates all missing tables, populates every module
 * with real data, and links employees to login accounts.
 *
 * Idempotent: every CREATE TABLE is IF NOT EXISTS, every INSERT is guarded.
 * Safe to re-run at any time.
 *
 * Usage: node seed-all.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;

const p = new PrismaClient({ datasources: { db: { url } } });

// ── Table creation (IF NOT EXISTS) ────────────────────────────────────────

const TABLE_SQL = `
-- Leave balances per employee per leave type per year.
CREATE TABLE IF NOT EXISTS leave_balances (
  id               varchar(191) NOT NULL,
  employeeId       int(11)      NOT NULL,
  leaveTypeId      varchar(191) NOT NULL,
  openingBalance   decimal(6,2) NOT NULL DEFAULT 0.00,
  accruedBalance   decimal(6,2) NOT NULL DEFAULT 0.00,
  usedBalance      decimal(6,2) NOT NULL DEFAULT 0.00,
  reservedBalance  decimal(6,2) NOT NULL DEFAULT 0.00,
  availableBalance decimal(6,2) NOT NULL DEFAULT 0.00,
  year             int(11)      NOT NULL,
  lastAccruedAt    datetime(3)  DEFAULT NULL,
  createdAt        datetime(3)  NOT NULL DEFAULT current_timestamp(3),
  updatedAt        datetime(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY leave_balances_emp_type_year_key (employeeId, leaveTypeId, year),
  KEY leave_balances_emp_type_idx (employeeId, leaveTypeId),
  CONSTRAINT lb_employeeId_fkey FOREIGN KEY (employeeId) REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Leave type definitions (CL, PL, Sick, etc.)
CREATE TABLE IF NOT EXISTS leave_types (
  id               varchar(191) NOT NULL,
  name             varchar(50)  NOT NULL,
  displayName      varchar(100) NOT NULL,
  description      text         DEFAULT NULL,
  code             varchar(20)  NOT NULL,
  classification   varchar(10)  NOT NULL DEFAULT 'PAID',
  isHalfDayAllowed tinyint(1)   NOT NULL DEFAULT 1,
  isActive         tinyint(1)   NOT NULL DEFAULT 1,
  createdAt        datetime(3)  NOT NULL DEFAULT current_timestamp(3),
  updatedAt        datetime(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY leave_types_name_key (name),
  UNIQUE KEY leave_types_code_key (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Company-wide leave policies (default quotas per leave type)
CREATE TABLE IF NOT EXISTS leave_policies (
  id               varchar(191) NOT NULL,
  leaveTypeId      varchar(191) NOT NULL,
  maxDaysPerYear   decimal(5,2) NOT NULL DEFAULT 0.00,
  maxDaysPerMonth  decimal(5,2) NOT NULL DEFAULT 0.00,
  maxConsecutive   decimal(5,2) NOT NULL DEFAULT 0.00,
  requiresApproval tinyint(1)   NOT NULL DEFAULT 1,
  isActive         tinyint(1)   NOT NULL DEFAULT 1,
  createdAt        datetime(3)  NOT NULL DEFAULT current_timestamp(3),
  updatedAt        datetime(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY leave_policies_type_idx (leaveTypeId),
  CONSTRAINT lp_typeId_fkey FOREIGN KEY (leaveTypeId) REFERENCES leave_types (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Job titles / designations
CREATE TABLE IF NOT EXISTS designations (
  id          varchar(191) NOT NULL,
  name        varchar(100) NOT NULL,
  description varchar(255) DEFAULT NULL,
  isActive    tinyint(1)   NOT NULL DEFAULT 1,
  createdAt   datetime(3)  NOT NULL DEFAULT current_timestamp(3),
  updatedAt   datetime(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY designations_name_key (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- System-wide notifications
CREATE TABLE IF NOT EXISTS notifications (
  id        varchar(191) NOT NULL,
  userId    int(11)      NOT NULL,
  type      varchar(50)  NOT NULL DEFAULT 'INFO',
  title     varchar(200) NOT NULL,
  message   text         NOT NULL,
  isRead    tinyint(1)   NOT NULL DEFAULT 0,
  createdAt datetime(3)  NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (id),
  KEY notifications_userId_idx (userId),
  KEY notifications_userId_isRead_idx (userId, isRead),
  CONSTRAINT nf_userId_fkey FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
`;

// ── Seed data ──────────────────────────────────────────────────────────────

const LEAVE_TYPES = [
  // name must match the live leaves.type ENUM value
  { name: 'CASUAL',  displayName: 'Casual Leave',  code: 'CL',   classification: 'PAID',  maxYear: 12, maxMonth: 1.5, maxConsec: 3 },
  { name: 'SICK',    displayName: 'Sick Leave',    code: 'SL',   classification: 'PAID',  maxYear: 10, maxMonth: 1,   maxConsec: 5 },
  { name: 'EARNED',  displayName: 'Earned Leave',  code: 'EL',   classification: 'PAID',  maxYear: 18, maxMonth: 1.5, maxConsec: 10 },
  { name: 'MATERNITY', displayName: 'Maternity',    code: 'MAT',  classification: 'PAID',  maxYear: 180, maxMonth: 0, maxConsec: 180 },
  { name: 'PATERNITY', displayName: 'Paternity',    code: 'PAT',  classification: 'PAID',  maxYear: 10, maxMonth: 0, maxConsec: 10 },
  { name: 'UNPAID',  displayName: 'Unpaid Leave',  code: 'UL',   classification: 'UNPAID', maxYear: 30, maxMonth: 5, maxConsec: 30 },
];

const DESIGNATIONS = [
  { name: 'CEO / Founder',            description: 'Chief Executive Officer and company founder' },
  { name: 'VP of Engineering',        description: 'Vice President — Engineering' },
  { name: 'Engineering Manager',      description: 'Engineering team manager' },
  { name: 'Senior Software Engineer', description: 'Senior individual contributor — software' },
  { name: 'Software Engineer',        description: 'Individual contributor — software' },
  { name: 'Junior Developer',         description: 'Junior software developer' },
  { name: 'HR Manager',               description: 'Head of Human Resources' },
  { name: 'HR Executive',             description: 'HR operations staff' },
  { name: 'Financial Analyst',        description: 'Finance and accounting analyst' },
  { name: 'Payroll Executive',        description: 'Payroll processing staff' },
  { name: 'Sales Executive',          description: 'Sales and business development' },
  { name: 'Support Engineer',         description: 'Customer support technical staff' },
  { name: 'Recruiter',                description: 'Talent acquisition specialist' },
  { name: 'System Administrator',     description: 'IT infrastructure and systems' },
];

const { randomUUID } = require('crypto');
const year = new Date().getFullYear();
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

(async () => {
  console.log('=== Creating tables ===');
  for (const stmt of TABLE_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
    await p.$executeRawUnsafe(stmt);
  }
  console.log('  tables created');

  // ── Leave types ──────────────────────────────────────────────────────────
  console.log('=== Leave types ===');
  const ltIds = {};
  for (const lt of LEAVE_TYPES) {
    const ex = await p.$queryRaw`SELECT id FROM leave_types WHERE code = ${lt.code} LIMIT 1`;
    if (ex.length) {
      ltIds[lt.code] = ex[0].id;
      console.log('  ' + lt.displayName + ' (exists)');
      continue;
    }
    const id = randomUUID();
    await p.$executeRaw`
      INSERT INTO leave_types (id, name, displayName, description, code, classification, isHalfDayAllowed, isActive, createdAt, updatedAt)
      VALUES (${id}, ${lt.name}, ${lt.displayName}, NULL, ${lt.code}, ${lt.classification}, 1, 1, ${now}, ${now})
    `;
    ltIds[lt.code] = id;
    console.log('  ' + lt.displayName + ' (created)');
  }

  // ── Leave policies ───────────────────────────────────────────────────────
  console.log('=== Leave policies ===');
  for (const lt of LEAVE_TYPES) {
    const ex = await p.$queryRaw`SELECT id FROM leave_policies WHERE leaveTypeId = ${ltIds[lt.code]} LIMIT 1`;
    if (ex.length) { console.log('  ' + lt.displayName + ' policy (exists)'); continue; }
    await p.$executeRaw`
      INSERT INTO leave_policies (id, leaveTypeId, maxDaysPerYear, maxDaysPerMonth, maxConsecutive, requiresApproval, isActive, createdAt, updatedAt)
      VALUES (${randomUUID()}, ${ltIds[lt.code]}, ${lt.maxYear}, ${lt.maxMonth}, ${lt.maxConsec}, 1, 1, ${now}, ${now})
    `;
    console.log('  ' + lt.displayName + ' policy (created)');
  }

  // ── Designations ─────────────────────────────────────────────────────────
  console.log('=== Designations ===');
  const desIds = {};
  for (const d of DESIGNATIONS) {
    const ex = await p.$queryRaw`SELECT id FROM designations WHERE name = ${d.name} LIMIT 1`;
    if (ex.length) {
      desIds[d.name] = ex[0].id;
      console.log('  ' + d.name + ' (exists)');
      continue;
    }
    const id = randomUUID();
    await p.$executeRaw`
      INSERT INTO designations (id, name, description, isActive, createdAt, updatedAt)
      VALUES (${id}, ${d.name}, ${d.description}, 1, ${now}, ${now})
    `;
    desIds[d.name] = id;
    console.log('  ' + d.name + ' (created)');
  }

  // ── HR Manager account ───────────────────────────────────────────────────
  console.log('=== HR Manager account ===');
  let hrUserId;
  const hrEmail = 'hr@earnwealth.com';
  const hrEx = await p.$queryRaw`SELECT id FROM users WHERE email = ${hrEmail} LIMIT 1`;
  if (hrEx.length) {
    hrUserId = hrEx[0].id;
    console.log('  hr@earnwealth.com (exists)');
  } else {
    const { hashPassword } = require('./src/utils/password');
    const hash = await hashPassword('HR@123456');
    await p.$executeRaw`
      INSERT INTO users (name, email, passwordHash, role, isActive, createdAt, updatedAt)
      VALUES ('Priya Nair', ${hrEmail}, ${hash}, 'HR_MANAGER', 1, ${now}, ${now})
    `;
    const u = await p.$queryRaw`SELECT id FROM users WHERE email = ${hrEmail} LIMIT 1`;
    hrUserId = u[0].id;
    console.log('  hr@earnwealth.com (created) — password: HR@123456');
  }

  // ── Link employees to login accounts ─────────────────────────────────────
  console.log('=== Linking employees to login accounts ===');
  const { hashPassword } = require('./src/utils/password');
  const empHash = await hashPassword('Employee@123');
  const emps = await p.$queryRawUnsafe(
    'SELECT id, employeeCode, name, userId FROM employees ORDER BY id'
  );
  let linked = 0;
  for (const emp of emps) {
    const email = emp.employeeCode.toLowerCase() + '@earnwealth.com';
    const uEx = await p.$queryRaw`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    let uid;
    if (uEx.length) {
      uid = uEx[0].id;
    } else {
      await p.$executeRaw`
        INSERT INTO users (name, email, passwordHash, role, isActive, createdAt, updatedAt)
        VALUES (${emp.name}, ${email}, ${empHash}, 'EMPLOYEE', 1, ${now}, ${now})
      `;
      const u = await p.$queryRaw`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
      uid = u[0].id;
    }
    if (emp.userId === null || emp.userId === undefined) {
      await p.$executeRaw`UPDATE employees SET userId = ${uid}, updatedAt = ${now} WHERE id = ${emp.id}`;
      linked++;
    }
  }
  console.log('  employees linked: ' + linked);

  // ── Leave balances ────────────────────────────────────────────────────────
  console.log('=== Leave balances for ' + year + ' ===');
  let lbAdded = 0;
  for (const emp of emps) {
    for (const lt of LEAVE_TYPES) {
      const ltId = ltIds[lt.code];
      const ex = await p.$queryRaw`
        SELECT id FROM leave_balances WHERE employeeId = ${emp.id} AND leaveTypeId = ${ltId} AND year = ${year} LIMIT 1
      `;
      if (ex.length) continue;
      // Opening = accrued = default quota; used = actual leaves taken; available = opening - used.
      const opening = lt.maxYear;
      const accrued = lt.maxYear;
      const usedRows = await p.$queryRaw`
        SELECT COUNT(*) c FROM leaves
        WHERE employeeId = ${emp.id} AND status IN ('APPROVED','PENDING') AND type = ${lt.name} LIMIT 1
      `;
      const used = Number(usedRows[0].c) || 0;
      await p.$executeRaw`
        INSERT INTO leave_balances
          (id, employeeId, leaveTypeId, openingBalance, accruedBalance, usedBalance, reservedBalance, availableBalance, year, createdAt, updatedAt)
        VALUES (${randomUUID()}, ${emp.id}, ${ltId}, ${opening}, ${accrued}, ${used}, 0.00, ${opening - used}, ${year}, ${now}, ${now})
      `;
      lbAdded++;
    }
  }
  console.log('  leave balance rows: ' + lbAdded);

  // ── Notifications ─────────────────────────────────────────────────────────
  console.log('=== Notifications ===');
  const notifs = [
    { userId: 1, type: 'INFO',    title: 'Welcome to EWS HRMS',     message: 'Your account is active. Explore the dashboard to get started.' },
    { userId: 1, type: 'SYSTEM',  title: 'System Policy Updated',   message: 'Leave policy has been updated by the administrator.' },
    { userId: 1, type: 'ALERT',   title: 'October Payroll Ready',    message: 'October 2026 payroll is ready for processing.' },
  ];
  for (const n of notifs) {
    await p.$executeRaw`
      INSERT INTO notifications (id, userId, type, title, message, isRead, createdAt)
      SELECT ${randomUUID()}, ${n.userId}, ${n.type}, ${n.title}, ${n.message}, 0, ${now}
      WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE userId = ${n.userId} AND title = ${n.title})
    `;
  }
  const nc = await p.$queryRawUnsafe('SELECT COUNT(*) c FROM notifications');
  console.log('  notifications: ' + nc[0].c);

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('');
  const tables = [
    'users', 'employees', 'departments', 'designations', 'holidays',
    'attendance_logs', 'leaves', 'salary_slips', 'leave_types',
    'leave_balances', 'leave_policies', 'comp_off_credits',
    'comp_off_ledger', 'comp_off_policy', 'audit_logs', 'notifications',
  ];
  for (const t of tables) {
    const r = await p.$queryRawUnsafe('SELECT COUNT(*) c FROM ' + t);
    console.log('  ' + t.padEnd(18) + r[0].c);
  }

  console.log('');
  const roles = await p.$queryRawUnsafe(
    "SELECT role, COUNT(*) c FROM users GROUP BY role ORDER BY role"
  );
  console.log('Users by role:');
  roles.forEach(r => console.log('  ' + String(r.role).padEnd(14) + r.c));

  await p.$disconnect();
  console.log('\nSeed complete.');
})().catch(e => { console.error('ERR: ' + e.message); process.exit(1); });
