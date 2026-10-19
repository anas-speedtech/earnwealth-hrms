/* Adds brand-new test accounts for the E2E suite. ADDITIVE ONLY:
 * - never UPDATEs or DELETEs any existing row
 * - ids are auto-allocated by MariaDB and read back by email lookup
 * - every row is prefixed (e2e. / E2E-) so it is trivially removable later
 *
 * Test password for every account created here: EWS@12345  (bcrypt cost 12,
 * matching src/utils/password.js).
 *
 * Cleanup:
 *   DELETE FROM users WHERE email LIKE 'e2e.%@earnwealth.com';
 *   DELETE FROM employees WHERE employeeCode LIKE 'E2E-TEST-%';
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const PWD = 'EWS@12345';
const HOST_DOMAIN = '@earnwealth.com';

const USERS = [
  { prefix: 'e2e.sa',    role: 'SUPER_ADMIN', name: 'E2E Super Admin' },
  { prefix: 'e2e.admin', role: 'ADMIN',       name: 'E2E Admin' },
  { prefix: 'e2e.hr',    role: 'HR_MANAGER',  name: 'E2E HR Manager' },
  { prefix: 'e2e.emp1',  role: 'EMPLOYEE',    name: 'E2E Emp One' },
  { prefix: 'e2e.emp2',  role: 'EMPLOYEE',    name: 'E2E Emp Two' },
];

(async () => {
  const p = new PrismaClient();
  const hash = await bcrypt.hash(PWD, 12);
  const created = [];

  for (const u of USERS) {
    const email = `${u.prefix}${HOST_DOMAIN}`;

    const [existing] = await p.$queryRaw`
      SELECT CAST(id AS CHAR) AS id FROM users WHERE email = ${email}`;
    if (existing) { console.log(`skip (exists) ${email}`); continue; }

    await p.$executeRaw`
      INSERT INTO users (name, email, passwordHash, role, isActive, createdAt, updatedAt)
      VALUES (${u.name}, ${email}, ${hash}, ${u.role}, 1, NOW(3), NOW(3))`;

    // Read the id back by email — MariaDB's adapter does not return insertId
    // from $executeRaw, so looking it up is more portable.
    const [row] = await p.$queryRaw`
      SELECT CAST(id AS CHAR) AS id FROM users WHERE email = ${email}`;
    if (!row) { console.log(`FAILED to create ${email}`); continue; }
    const userId = row.id;

    if (u.role === 'EMPLOYEE') {
      const [d] = await p.$queryRaw`
        SELECT CAST(id AS CHAR) AS id FROM departments WHERE isActive = 1 ORDER BY id LIMIT 1`;
      const deptId = d ? d.id : null;
      const code = 'E2E-TEST-' + String(userId).padStart(4, '0');
      await p.$executeRaw`
        INSERT INTO employees (userId, employeeCode, name, designation, joiningDate,
            deviceEnrollNo, basicSalary, allowances, deductions, isActive,
            createdAt, updatedAt, departmentId)
        VALUES (${userId}, ${code}, ${u.name}, 'E2E Test Engineer', CURDATE(),
            ${9900 + Number(userId)}, 50000.00, 10000.00, 2000.00, 1,
            NOW(3), NOW(3), ${deptId})`;
    }
    created.push({ userId, role: u.role, email });
  }

  console.log('\nCREATED ' + created.length + ' accounts (password: ' + PWD + ')');
  for (const c of created) console.log('  ' + c.role.padEnd(12) + c.email);

  const rows = await p.$queryRaw`
    SELECT email, passwordHash FROM users WHERE email LIKE ${'e2e.%@earnwealth.com'}`;
  let bad = 0;
  for (const r of rows) {
    if (!(await bcrypt.compare(PWD, r.passwordHash))) { console.log('  VERIFY FAIL ' + r.email); bad++; }
  }
  console.log('bcrypt round-trip: ' + (bad === 0 ? 'ALL PASS' : bad + ' FAILED'));

  const total = await p.$queryRaw`SELECT CAST(COUNT(*) AS CHAR) AS n FROM users`;
  console.log('users table now has ' + total[0].n + ' rows (was 11 before)');

  await p.$disconnect();
})().catch(e => { console.log('FATAL', String(e.message).slice(0, 400)); process.exit(1); });
