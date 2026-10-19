require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;
const p = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  console.log('=== USERS ===');
  const u = await p.$queryRawUnsafe('SELECT id,name,email,role,isActive FROM users ORDER BY id');
  u.forEach((x) => console.log('  ' + String(x.id).padEnd(4) + x.email.padEnd(32) + x.role.padEnd(13) + 'active=' + x.isActive));

  console.log('=== EMPLOYEES ===');
  const e = await p.$queryRawUnsafe(
    'SELECT e.id,e.userId,e.employeeCode,e.name,e.designation,e.departmentId,e.basicSalary,e.isActive,u.email,u.role ' +
      'FROM employees e LEFT JOIN users u ON u.id=e.userId ORDER BY e.id'
  );
  e.forEach((x) => console.log('  emp#' + x.id + ' user=' + (x.userId === null ? 'NULL' : x.userId) + ' ' + String(x.email).padEnd(30) + 'role=' + String(x.role).padEnd(12) + 'dept=' + (x.departmentId === null ? 'NULL' : x.departmentId) + ' active=' + x.isActive));

  console.log('=== LEAVES (distinct types/status) ===');
  const l = await p.$queryRawUnsafe('SELECT type,status,COUNT(*) n FROM leaves GROUP BY type,status');
  l.forEach((x) => console.log('  ' + x.type + ' / ' + x.status + ' -> ' + x.n));

  console.log('=== ATTENDANCE (months covered) ===');
  const a = await p.$queryRawUnsafe(
    'SELECT DATE_FORMAT(date, "%Y-%m") ym, COUNT(*) n, SUM(isPresent) present, SUM(isWfh) wfh FROM attendance_logs GROUP BY ym ORDER BY ym'
  );
  a.forEach((x) => console.log('  ' + x.ym + '  total=' + x.n + ' present=' + x.present + ' wfh=' + x.wfh));

  console.log('=== SALARY SLIPS ===');
  const s = await p.$queryRawUnsafe('SELECT employeeId,month,year,netPay FROM salary_slips ORDER BY year DESC,month DESC LIMIT 10');
  s.forEach((x) => console.log('  emp#' + x.employeeId + ' ' + x.year + '-' + String(x.month).padStart(2, '0') + ' netPay=' + x.netPay));

  console.log('=== LEAVE BALANCE TABLE? ===');
  try {
    const lb = await p.$queryRawUnsafe('SELECT COUNT(*) n FROM leave_balances');
    console.log('  leave_balances EXISTS with ' + lb[0].n + ' rows');
  } catch { console.log('  leave_balances MISSING'); }

  await p.$disconnect();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
