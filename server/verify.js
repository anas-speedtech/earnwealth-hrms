require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;
const p = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  console.log('LOGIN ACCOUNTS (password: Employee@123):');
  const u = await p.$queryRawUnsafe(
    "SELECT u.email,u.role,u.isActive,e.employeeCode,e.name FROM users u " +
    "LEFT JOIN employees e ON e.userId=u.id WHERE u.role='EMPLOYEE' ORDER BY u.email"
  );
  u.forEach((x) => console.log('  ' + x.email.padEnd(34) + x.role.padEnd(10) + 'active=' + x.isActive + ' ' + (x.employeeCode || '-')));

  console.log('');
  console.log('LEAVES BY TYPE/STATUS:');
  const l = await p.$queryRawUnsafe('SELECT type,status,COUNT(*) n FROM leaves GROUP BY type,status ORDER BY type');
  l.forEach((x) => console.log('  ' + x.type.padEnd(9) + x.status.padEnd(11) + x.n));

  console.log('');
  console.log('SALARY SLIPS (latest 8):');
  const s = await p.$queryRawUnsafe(
    'SELECT e.employeeCode,e.name,s.year,s.month,s.workingDays,s.presentDays,s.absentDays,s.netPay ' +
    'FROM salary_slips s JOIN employees e ON e.id=s.employeeId ORDER BY s.year DESC,s.month DESC,e.employeeCode LIMIT 8'
  );
  s.forEach((x) => console.log('  ' + x.employeeCode + ' ' + x.name.padEnd(18) + x.year + '-' + String(x.month).padStart(2, '0') + ' wd=' + x.workingDays + ' p=' + x.presentDays + ' a=' + x.absentDays + ' net=' + x.netPay));

  console.log('');
  console.log('ATTENDANCE:');
  const a = await p.$queryRawUnsafe(
    "SELECT COUNT(DISTINCT employeeId) emps, COUNT(*) punches, SUM(status='IN') ins, SUM(status='OUT') outs, MIN(DATE(punchTime)) mn, MAX(DATE(punchTime)) mx FROM attendance_logs"
  );
  console.log('  employees=' + a[0].emps + ' punches=' + a[0].punches + ' IN=' + a[0].ins + ' OUT=' + a[0].outs);
  console.log('  range=' + a[0].mn.toISOString().slice(0, 10) + ' to ' + a[0].mx.toISOString().slice(0, 10));

  console.log('');
  console.log('COMP-OFF:');
  const c = await p.$queryRawUnsafe(
    'SELECT e.employeeCode,c.status,c.earnedDays,c.usedDays,(c.earnedDays-c.usedDays) avail,c.expiresAt ' +
    'FROM comp_off_credits c JOIN employees e ON e.id=c.employeeId ORDER BY e.employeeCode'
  );
  c.forEach((x) => console.log('  ' + x.employeeCode + ' ' + x.status.padEnd(16) + 'earned=' + x.earnedDays + ' used=' + x.usedDays + ' available=' + x.avail));

  await p.$disconnect();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
