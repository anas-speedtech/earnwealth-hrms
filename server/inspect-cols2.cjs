/* READ-ONLY: attendance_logs columns + which code references missing delegates. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const c = await p.$queryRawUnsafe(
    "SELECT COLUMN_NAME n, COLUMN_TYPE ct, IS_NULLABLE nn, COLUMN_DEFAULT dv FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='ews-hrms' AND TABLE_NAME='attendance_logs' ORDER BY ORDINAL_POSITION");
  console.log('--- attendance_logs (' + c.length + ' cols) ---');
  for (const r of c) console.log('   ' + String(r.n).padEnd(26) + String(r.ct).padEnd(16) + (r.nn === 'YES' ? 'NULL' : 'NOT NULL') + (r.dv !== null ? '  def=' + r.dv : ''));

  const ix = await p.$queryRawUnsafe(
    "SELECT INDEX_NAME i, NON_UNIQUE u, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='ews-hrms' AND TABLE_NAME='attendance_logs' GROUP BY INDEX_NAME, NON_UNIQUE");
  for (const r of ix) console.log('   idx ' + r.i + (r.u === 1 ? ' unique' : '') + ' (' + r.cols + ')');

  const e = await p.$queryRawUnsafe(
    "SELECT COLUMN_NAME n, COLUMN_TYPE ct FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='ews-hrms' AND TABLE_NAME='employees' ORDER BY ORDINAL_POSITION");
  console.log('\n--- employees (' + e.length + ' cols) ---');
  console.log(e.map(r => r.n).join(', '));

  await p.$disconnect();
})().catch(e2 => { console.log('FATAL', String(e2.message).slice(0, 300)); process.exit(1); });
