require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
<<<<<<< Updated upstream
  const emps = await p.$queryRawUnsafe(
    "SELECT id, employeeCode, name, userId, departmentId, reportingManagerId, isActive FROM employees"
  );
  console.log("existing employees:", JSON.stringify(emps));
  for (const emp of emps) {
    await p.$executeRawUnsafe(
      `INSERT INTO employee_profiles
         (employeeCode, firstName, lastName, departmentId, reportingManagerId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         firstName = VALUES(firstName),
         lastName = VALUES(lastName),
         departmentId = VALUES(departmentId),
         reportingManagerId = VALUES(reportingManagerId),
         status = VALUES(status)`,
      emp.employeeCode,
      String(emp.name || '').trim().split(/\s+/)[0] || '',
      String(emp.name || '').trim().split(/\s+/).slice(1).join(' '),
      emp.departmentId ? Number(emp.departmentId) : null,
      emp.reportingManagerId ? Number(emp.reportingManagerId) : null,
      emp.isActive ? 'ACTIVE' : 'INACTIVE'
    );
  }
  const profiles = await p.employeeProfile.findMany();
  console.log("synced profiles:", JSON.stringify(profiles.map(x => ({ id: x.id, userId: x.userId, code: x.employeeCode }))));
  await p.$disconnect();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
=======
  await p.$executeRaw`
    INSERT INTO employee_profiles
      (employeeCode, userId, firstName, lastName, departmentId, reportingManagerId, status, createdAt, updatedAt)
    SELECT
      e.employeeCode,
      e.userId,
      SUBSTRING_INDEX(e.name, ' ', 1)                                              AS firstName,
      TRIM(SUBSTRING(e.name, LENGTH(SUBSTRING_INDEX(e.name, ' ', 1)) + 1))         AS lastName,
      e.departmentId,
      e.reportingManagerId,
      CASE WHEN e.isActive = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END                  AS status,
      NOW(3), NOW(3)
    FROM employees e
    ON DUPLICATE KEY UPDATE
      employeeCode      = VALUES(employeeCode),
      userId            = VALUES(userId),
      firstName         = VALUES(firstName),
      lastName          = VALUES(lastName),
      departmentId      = VALUES(departmentId),
      reportingManagerId = VALUES(reportingManagerId),
      status            = VALUES(status),
      updatedAt         = NOW(3)
  `;
  const rows = await p.$queryRaw`
    SELECT id, employeeCode, userId, firstName, lastName, status FROM employee_profiles
  `;
  console.log('Rows synced:', rows.length);
  console.log(JSON.stringify(rows, null, 2));
  await p.$disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
>>>>>>> Stashed changes
