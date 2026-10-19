/* READ-ONLY: dump column definitions for the tables the Prisma schema is missing. */
const { PrismaClient } = require('@prisma/client');
const TABLES = ['leave_types','leave_policies','leave_balances','designations','comp_off_leave','holidays'];
(async () => {
  const p = new PrismaClient();
  const rows = await p.$queryRawUnsafe(
    `SELECT table_name, column_name, column_type, is_nullable, column_default
     FROM information_schema.columns WHERE table_schema = DATABASE()
     ORDER BY table_name, ordinal_position`);
  const byT = {};
  for (const r of rows) if (TABLES.includes(r.table_name)) (byT[r.table_name] = byT[r.table_name] || []).push(r);
  for (const t of TABLES) {
    console.log('\n### ' + t + (byT[t] ? '  (' + byT[t].length + ')' : '  -- MISSING FROM DB'));
    for (const c of byT[t] || []) console.log(`   ${c.column_name.padEnd(20)} ${c.column_type.padEnd(18)} ${c.is_nullable === 'YES' ? 'NULL' : 'NOTNULL'}`);
  }
  await p.$disconnect();
})().catch(e => { console.log('ERR ' + String(e.message).slice(0,300)); process.exit(1); });
