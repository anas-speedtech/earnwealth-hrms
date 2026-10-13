require('dotenv').config({ path: 'C:/Users/ARYA/Desktop/EWS-HRMS1/server/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` } }
});
(async () => {
  try {
    console.log('=== attendance_logs columns ===');
    const attCols = await prisma.$queryRaw`SHOW COLUMNS FROM attendance_logs`;
    attCols.forEach(c => console.log('  ' + c.Field + ' | ' + c.Type));

    console.log('\n=== departments columns ===');
    const deptCols = await prisma.$queryRaw`SHOW COLUMNS FROM departments`;
    deptCols.forEach(c => console.log('  ' + c.Field + ' | ' + c.Type));

    console.log('\n=== employees columns ===');
    const empCols = await prisma.$queryRaw`SHOW COLUMNS FROM employees`;
    empCols.forEach(c => console.log('  ' + c.Field + ' | ' + c.Type));

    console.log('\n=== leaves columns ===');
    const leaveCols = await prisma.$queryRaw`SHOW COLUMNS FROM leaves`;
    leaveCols.forEach(c => console.log('  ' + c.Field + ' | ' + c.Type));

    console.log('\n=== salary_slips columns ===');
    const slipCols = await prisma.$queryRaw`SHOW COLUMNS FROM salary_slips`;
    slipCols.forEach(c => console.log('  ' + c.Field + ' | ' + c.Type));

    console.log('\n=== Row counts ===');
    const counts = await prisma.$queryRaw`
      SELECT 'attendance_logs' AS t, COUNT(*) AS c FROM attendance_logs UNION ALL
      SELECT 'departments', COUNT(*) FROM departments UNION ALL
      SELECT 'employees', COUNT(*) FROM employees UNION ALL
      SELECT 'holidays', COUNT(*) FROM holidays UNION ALL
      SELECT 'leaves', COUNT(*) FROM leaves UNION ALL
      SELECT 'salary_slips', COUNT(*) FROM salary_slips UNION ALL
      SELECT 'users', COUNT(*) FROM users
    `;
    counts.forEach(r => console.log('  ' + r.t + ': ' + r.c));

    await prisma.$disconnect();
  } catch(e) { console.error('ERROR:', e.message); process.exit(1); }
})();
