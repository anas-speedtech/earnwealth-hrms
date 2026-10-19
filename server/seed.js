/**
 * Seeds the EWS HRMS database with a coherent dataset for testing.
 *
 * Idempotent: every insert is guarded, so re-running adds nothing. Nothing is
 * deleted or updated that already exists, so this is safe against a database
 * that already holds rows.
 *
 * What it creates:
 *   - departments, employees, holidays
 *   - one login account per employee (role EMPLOYEE), linked via employees.userId
 *   - attendance punch pairs (IN/OUT) covering several past months
 *   - leaves of each type and status
 *   - salary slips derived from actual attendance
 *   - comp-off credits and their ledger entries
 *
 * Usage: node seed.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;

const p = new PrismaClient({ datasources: { db: { url } } });

const EMPLOYEE_PASSWORD = 'Employee@123';

const DEPARTMENTS = [
  { name: 'Engineering',      description: 'Software and platform engineering' },
  { name: 'Human Resources',  description: 'Recruitment, employee relations, policy' },
  { name: 'Finance',          description: 'Accounts, payroll, reporting' },
  { name: 'Sales',            description: 'Business development and accounts' },
  { name: 'Customer Support', description: 'Onboarding and technical support' },
];

const EMPLOYEES = [
  { code: 'EMP-1001', name: 'Aarav Sharma',   designation: 'Senior Software Engineer', dept: 'Engineering',      basic: 85000, joining: '2021-06-14', device: 1001 },
  { code: 'EMP-1002', name: 'Priya Nair',     designation: 'HR Manager',               dept: 'Human Resources',  basic: 72000, joining: '2020-03-02', device: 1002 },
  { code: 'EMP-1003', name: 'Rohan Desai',    designation: 'Financial Analyst',        dept: 'Finance',          basic: 58000, joining: '2022-01-10', device: 1003 },
  { code: 'EMP-1004', name: 'Sneha Kulkarni', designation: 'Sales Executive',          dept: 'Sales',            basic: 48000, joining: '2022-08-22', device: 1004 },
  { code: 'EMP-1005', name: 'Vikram Iyer',    designation: 'Support Engineer',         dept: 'Customer Support', basic: 42000, joining: '2023-02-13', device: 1005 },
  { code: 'EMP-1006', name: 'Ananya Reddy',   designation: 'Junior Developer',         dept: 'Engineering',      basic: 45000, joining: '2023-07-03', device: 1006 },
  { code: 'EMP-1007', name: 'Karthik Menon',  designation: 'Payroll Executive',        dept: 'Finance',          basic: 46000, joining: '2021-11-29', device: 1007 },
  { code: 'EMP-1008', name: 'Ishita Bose',    designation: 'Recruiter',                dept: 'Human Resources',  basic: 44000, joining: '2023-09-18', device: 1008 },
];

const HOLIDAYS = [
  { name: 'Republic Day',     date: '2026-01-26', recurring: 1 },
  { name: 'Holi',             date: '2026-03-03', recurring: 0 },
  { name: 'Good Friday',      date: '2026-04-03', recurring: 0 },
  { name: 'May Day',          date: '2026-05-01', recurring: 1 },
  { name: 'Independence Day', date: '2026-08-15', recurring: 1 },
  { name: 'Gandhi Jayanti',   date: '2026-10-02', recurring: 1 },
  { name: 'Diwali',           date: '2026-11-08', recurring: 0 },
  { name: 'Christmas',        date: '2026-12-25', recurring: 1 },
];

function pad(n) { return String(n).padStart(2, '0'); }

function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

function shiftDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

function isWeekend(d) { const w = d.getDay(); return w === 0 || w === 6; }

(async () => {
  console.log('Seeding EWS HRMS...\n');
  const passwordHash = await bcrypt.hash(EMPLOYEE_PASSWORD, 12);

  // ---- Departments ----
  const deptIds = {};
  for (const d of DEPARTMENTS) {
    const found = await p.$queryRaw`SELECT id FROM departments WHERE name = ${d.name} LIMIT 1`;
    if (found.length) { deptIds[d.name] = found[0].id; continue; }
    await p.$executeRaw`
      INSERT INTO departments (name, description, isActive, createdAt, updatedAt)
      VALUES (${d.name}, ${d.description}, 1, NOW(3), NOW(3))
    `;
    const row = await p.$queryRaw`SELECT id FROM departments WHERE name = ${d.name} LIMIT 1`;
    deptIds[d.name] = row[0].id;
  }
  console.log('  departments: ' + Object.keys(deptIds).length);

  // ---- Employee accounts and records ----
  let accountsCreated = 0;
  let employeesCreated = 0;
  const employeeIds = {};

  for (const e of EMPLOYEES) {
    // The employee's login email follows a predictable pattern so the accounts
    // are easy to find and test.
    const email = e.code.toLowerCase() + '@earnwealth.com';

    // Employee row first: employees.userId is UNIQUE, so each employee needs
    // its own user row.
    let emp = await p.$queryRaw`SELECT id FROM employees WHERE employeeCode = ${e.code} LIMIT 1`;
    if (!emp.length) {
      await p.$executeRaw`
        INSERT INTO employees
          (userId, employeeCode, name, designation, joiningDate, deviceEnrollNo,
           basicSalary, allowances, deductions, isActive, departmentId, departmentText,
           createdAt, updatedAt)
        VALUES
          (NULL, ${e.code}, ${e.name}, ${e.designation}, ${e.joining}, ${e.device},
           ${e.basic}, 0.00, 0.00, 1, ${deptIds[e.dept]}, ${e.dept}, NOW(3), NOW(3))
      `;
      employeesCreated++;
      emp = await p.$queryRaw`SELECT id FROM employees WHERE employeeCode = ${e.code} LIMIT 1`;
    }
    employeeIds[e.code] = emp[0].id;

    // Login account, linked to the employee row.
    const linked = await p.$queryRaw`SELECT userId FROM employees WHERE id = ${emp[0].id} LIMIT 1`;
    if (!linked.length || linked[0].userId !== null) continue;

    const existingUser = await p.$queryRaw`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    let userId;
    if (existingUser.length) {
      userId = existingUser[0].id;
    } else {
      await p.$executeRaw`
        INSERT INTO users (name, email, passwordHash, role, isActive, createdAt, updatedAt)
        VALUES (${e.name}, ${email}, ${passwordHash}, 'EMPLOYEE', 1, NOW(3), NOW(3))
      `;
      const u = await p.$queryRaw`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
      userId = u[0].id;
      accountsCreated++;
    }

    await p.$executeRaw`
      UPDATE employees SET userId = ${userId}, updatedAt = NOW(3) WHERE id = ${emp[0].id}
    `;
  }
  console.log('  employee accounts created: ' + accountsCreated);
  console.log('  employee rows created: ' + employeesCreated);

  // ---- Holidays ----
  let holAdded = 0;
  for (const h of HOLIDAYS) {
    const found = await p.$queryRaw`SELECT id FROM holidays WHERE name = ${h.name} AND date = ${h.date} LIMIT 1`;
    if (found.length) continue;
    await p.$executeRaw`
      INSERT INTO holidays (name, date, isRecurring, createdAt, updatedAt)
      VALUES (${h.name}, ${h.date}, ${h.recurring}, NOW(3), NOW(3))
    `;
    holAdded++;
  }
  console.log('  holidays added: ' + holAdded);

  // ---- Attendance ----
  // Three months of weekday IN/OUT pairs. The third employee is occasionally
  // absent, and a couple of Saturdays are worked, so the numbers vary.
  let attAdded = 0;
  const workingFrom = -90;

  for (let offset = 0; offset >= workingFrom; offset--) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    if (isWeekend(d)) continue;

    const day = dateStr(d);

    for (const e of EMPLOYEES) {
      const empId = employeeIds[e.code];

      // Deterministic variety: every 9th day is absent for this employee.
      const absent = ((-offset) % 9 === 4) && e.code === 'EMP-1003';
      if (absent) continue;

      const lateIn = (-offset) % 11 === 0;
      const inHour = lateIn ? 10 : 9;
      const inMinute = lateIn ? 25 : 5;
      const outHour = lateIn ? 19 : 18;

      const inTime = day + ' ' + pad(inHour) + ':' + pad(inMinute) + ':00';
      const outTime = day + ' ' + pad(outHour) + ':30:00';

      // Guard on the whole day, so a partially-seeded earlier run does not
      // collide with the OUT punch when the IN punch already exists.
      const dup = await p.$queryRaw`
        SELECT id FROM attendance_logs
        WHERE employeeId = ${empId} AND DATE(punchTime) = ${day} LIMIT 1
      `;
      if (dup.length) continue;

      await p.$executeRaw`
        INSERT INTO attendance_logs (employeeId, punchTime, status, source, createdAt)
        VALUES (${empId}, ${inTime}, 'IN', 'MANUAL', NOW(3))
      `;
      await p.$executeRaw`
        INSERT INTO attendance_logs (employeeId, punchTime, status, source, createdAt)
        VALUES (${empId}, ${outTime}, 'OUT', 'MANUAL', NOW(3))
      `;
      attAdded += 2;
    }
  }
  console.log('  attendance punches added: ' + attAdded);

  // ---- Leaves ----
  // The live `leaves.type` enum is CASUAL, SICK, EARNED, MATERNITY, PATERNITY,
  // UNPAID, so leave types are limited to those values.
  const LEAVES = [
    { code: 'EMP-1001', type: 'CASUAL', status: 'APPROVED', from: -20, to: -20, reason: 'Personal work' },
    { code: 'EMP-1002', type: 'EARNED', status: 'APPROVED', from: -26, to: -23, reason: 'Annual leave' },
    { code: 'EMP-1003', type: 'SICK',   status: 'APPROVED', from: -12, to: -11, reason: 'Fever' },
    { code: 'EMP-1004', type: 'CASUAL', status: 'PENDING',  from:   3, to:   4, reason: 'Family function' },
    { code: 'EMP-1005', type: 'EARNED', status: 'PENDING',  from:   7, to:  11, reason: 'Vacation' },
    { code: 'EMP-1006', type: 'CASUAL', status: 'REJECTED', from:  -9, to:  -9, reason: 'Insufficient notice' },
    { code: 'EMP-1007', type: 'SICK',   status: 'CANCELLED', from: -30, to: -30, reason: 'Recovered, not needed' },
    { code: 'EMP-1008', type: 'UNPAID', status: 'APPROVED', from: -40, to: -36, reason: 'Extended personal leave' },
  ];

  let leaveAdded = 0;
  for (const l of LEAVES) {
    const start = shiftDays(l.from);
    const end = shiftDays(l.to);
    const empId = employeeIds[l.code];

    const dup = await p.$queryRaw`
      SELECT id FROM leaves
      WHERE employeeId = ${empId} AND startDate = ${start} AND type = ${l.type} LIMIT 1
    `;
    if (dup.length) continue;

    await p.$executeRaw`
      INSERT INTO leaves
        (employeeId, type, status, startDate, endDate, reason, approverId, approverNote, createdAt, updatedAt)
      VALUES
        (${empId}, ${l.type}, ${l.status}, ${start}, ${end}, ${l.reason},
         ${l.status === 'PENDING' ? null : 1},
         ${l.status === 'PENDING' ? null : 'Reviewed by HR'}, NOW(3), NOW(3))
    `;
    leaveAdded++;
  }
  console.log('  leaves added: ' + leaveAdded);

  // ---- Salary slips ----
  // One slip per employee for each of the last three months, with present days
  // counted from that month's attendance rather than invented.
  let slipsAdded = 0;
  const now = new Date();
  const superAdminId = 1;

  for (let monthsBack = 2; monthsBack >= 0; monthsBack--) {
    const target = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const year = target.getFullYear();
    const month = target.getMonth() + 1;
    const monthStart = year + '-' + pad(month) + '-01';
    const nextMonth = month === 12 ? (year + 1) + '-01-01' : year + '-' + pad(month + 1) + '-01';

    // Working days in the month, excluding weekends.
    let workingDays = 0;
    for (let day = 1; day <= 31; day++) {
      const probe = new Date(year, month - 1, day);
      if (probe.getMonth() !== month - 1) break;
      if (!isWeekend(probe)) workingDays++;
    }

    for (const e of EMPLOYEES) {
      const empId = employeeIds[e.code];

      const dup = await p.$queryRaw`
        SELECT id FROM salary_slips WHERE employeeId = ${empId} AND month = ${month} AND year = ${year} LIMIT 1
      `;
      if (dup.length) continue;

      // Count distinct days on which this employee punched IN that month.
      const presentRows = await p.$queryRaw`
        SELECT COUNT(DISTINCT DATE(punchTime)) AS days
        FROM attendance_logs
        WHERE employeeId = ${empId}
          AND status = 'IN'
          AND punchTime >= ${monthStart}
          AND punchTime < ${nextMonth}
      `;
      const presentDays = Math.min(Number(presentRows[0].days), workingDays);
      const absentDays = Math.max(0, workingDays - presentDays);

      // Simple, transparent structure: basic + 20% allowance, less 8% deduction.
      const basic = Number(e.basic);
      const allowances = Math.round(basic * 0.2 * 100) / 100;
      const deductions = Math.round(basic * 0.08 * 100) / 100;
      const netPay = Math.round((basic + allowances - deductions) * 100) / 100;

      await p.$executeRaw`
        INSERT INTO salary_slips
          (employeeId, month, year, workingDays, presentDays, absentDays,
           basic, allowances, deductions, netPay, generatedBy, createdAt)
        VALUES
          (${empId}, ${month}, ${year}, ${workingDays}, ${presentDays}, ${absentDays},
           ${basic}, ${allowances}, ${deductions}, ${netPay}, ${superAdminId}, NOW(3))
      `;
      slipsAdded++;
    }
  }
  console.log('  salary slips added: ' + slipsAdded);

  // ---- Comp-off credits ----
  // Two credits for one employee (one available, one fully used), plus the
  // matching ledger rows, so the balance and history both have content.
  const { randomUUID } = require('crypto');
  let creditsAdded = 0;

  const COMPOFFS = [
    { code: 'EMP-1005', source: -45, earned: 1, used: 0, status: 'AVAILABLE', expiresInDays: 45, reason: 'Worked on release weekend' },
    { code: 'EMP-1006', source: -35, earned: 2, used: 1, status: 'PARTIALLY_USED', expiresInDays: 55, reason: 'Deployment support' },
    { code: 'EMP-1001', source: -60, earned: 1, used: 1, status: 'FULLY_USED', expiresInDays: 30, reason: 'Client escalation' },
  ];

  for (const c of COMPOFFS) {
    const empId = employeeIds[c.code];
    const sourceDate = shiftDays(c.source);
    const expiresAt = shiftDays(c.expiresInDays);

    const dup = await p.$queryRaw`
      SELECT id FROM comp_off_credits WHERE employeeId = ${empId} AND sourceDate = ${sourceDate} LIMIT 1
    `;
    if (dup.length) continue;

    const creditId = randomUUID();
    const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await p.$executeRaw`
      INSERT INTO comp_off_credits
        (id, employeeId, sourceDate, earnedDays, usedDays, status, expiresAt,
         reason, approvedBy, approvedAt, createdAt, updatedAt)
      VALUES
        (${creditId}, ${empId}, ${sourceDate}, ${c.earned}, ${c.used}, ${c.status},
         ${expiresAt}, ${c.reason}, 'HR', ${nowSql}, ${nowSql}, ${nowSql})
    `;

    // Ledger: one EARN row, plus a USE row when days were consumed.
    const availableAfterEarn = c.earned;

    await p.$executeRaw`
      INSERT INTO comp_off_ledger
        (id, creditId, employeeId, type, amount, balanceAfter, note, createdAt)
      VALUES
        (${randomUUID()}, ${creditId}, ${empId}, 'EARN', ${c.earned},
         ${availableAfterEarn}, 'Comp-off credit granted', ${nowSql})
    `;

    if (c.used > 0) {
      const remaining = availableAfterEarn - c.used;
      await p.$executeRaw`
        INSERT INTO comp_off_ledger
          (id, creditId, employeeId, type, amount, balanceAfter, note, createdAt)
        VALUES
          (${randomUUID()}, ${creditId}, ${empId}, 'USE', ${c.used},
           ${remaining}, 'Comp-off availed', ${nowSql})
      `;
    }

    creditsAdded++;
  }
  console.log('  comp-off credits added: ' + creditsAdded);

  // ---- Summary ----
  console.log('');
  for (const t of ['departments', 'employees', 'users', 'holidays', 'attendance_logs',
                   'leaves', 'salary_slips', 'comp_off_credits', 'comp_off_ledger', 'comp_off_policy']) {
    const r = await p.$queryRawUnsafe('SELECT COUNT(*) c FROM ' + t);
    console.log('  ' + t.padEnd(20) + r[0].c);
  }

  await p.$disconnect();
  console.log('\nSeed complete.');
})().catch((e) => {
  console.error('ERR: ' + e.message);
  process.exit(1);
});
