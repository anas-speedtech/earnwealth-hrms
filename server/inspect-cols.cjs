/* READ-ONLY: dump columns + indexes for tables whose Prisma models are missing. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const tables = ['leave_types', 'leave_policies', 'designations', 'leaves',
                  'leave_balances', 'salary_slips'];
  for (const t of tables) {
    const c = await p.$queryRawUnsafe(
      "SELECT COLUMN_NAME n, COLUMN_TYPE ct, IS_NULLABLE nn, COLUMN_DEFAULT dv FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='ews-hrms' AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",
      t
    );
    console.log('\n--- ' + t + ' (' + c.length + ' cols) ---');
    for (const r of c) console.log('   ' + String(r.n).padEnd(26) + String(r.ct).padEnd(14) + (r.nn === 'YES' ? 'NULL' : 'NOT NULL') + (r.dv !== null ? '  def=' + r.dv : ''));

    const ix = await p.$queryRawUnsafe(
      "SELECT INDEX_NAME i, NON_UNIQUE u, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='ews-hrms' AND TABLE_NAME=? GROUP BY INDEX_NAME, NON_UNIQUE",
      t
    );
    for (const r of ix) console.log('   idx ' + r.i + ' ' + (r.u === 1 ? 'unique' : '') + ' (' + r.cols + ')');
  }
  await p.$disconnect();
})().catch(e => { console.log('FATAL', String(e.message).slice(0, 300)); process.exit(1); });
