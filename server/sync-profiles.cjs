require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
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
