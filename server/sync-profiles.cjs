require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // One-shot sync of the legacy `employees` table into Prisma's
  // `employee_profiles`. `userId` is mandatory (the column is NOT NULL and has
  // no default), so it must be in the SELECT list — omitting it is what raised
  // "Error 1364: Field 'userId' doesn't have a default value".
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
