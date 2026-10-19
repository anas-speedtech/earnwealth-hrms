require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const url = 'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;
const p = new PrismaClient({ datasources: { db: { url } } });
(async () => {
  const rows = await p.$queryRawUnsafe(
    "SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ct FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('leaves','salary_slips','attendance_logs') AND (COLUMN_NAME LIKE '%Id' OR COLUMN_NAME='id') ORDER BY TABLE_NAME, ORDINAL_POSITION"
  );
  rows.forEach((r) => console.log('  ' + r.t.padEnd(16) + r.c.padEnd(16) + r.ct));
  console.log('');
  const lv = await p.$queryRawUnsafe('SELECT id, employeeId, type, status FROM leaves LIMIT 6');
  lv.forEach((r) => console.log('  leave id=' + r.id + ' employeeId=' + r.employeeId + ' type=' + r.type + ' ' + r.status));
  await p.$disconnect();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
