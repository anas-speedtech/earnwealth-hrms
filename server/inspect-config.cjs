/* READ-ONLY config/DB inspection. Issues no DML or DDL. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  console.log('=== GRANTS (can I create a test DB?) ===');
  const g = await p.$queryRaw`SHOW GRANTS FOR CURRENT_USER()`;
  for (const row of g) console.log('  ' + row['Grants for CURRENT_USER()']);

  console.log('\n=== CURRENT DATABASE / VERSION ===');
  const c = await p.$queryRaw`SELECT DATABASE() AS db, VERSION() AS v, @@lower_case_table_names AS lct`;
  console.log('  db=' + c[0].db + '  version=' + c[0].v + '  lower_case_table_names=' + String(c[0].lct));

  console.log('\n=== ews-hrms TABLES (row counts, no array args) ===');
  const tabs = (await p.$queryRaw`
    SELECT TABLE_NAME AS n, TABLE_ROWS AS est FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'ews-hrms' ORDER BY TABLE_NAME`).map(r => r.n);
  for (const t of tabs) {
    try {
      const r = await p.$queryRaw`SELECT CAST(COUNT(*) AS CHAR) AS n FROM \`${t}\``;
      console.log('  ' + String(t).padEnd(24) + r[0].n);
    } catch (e) { console.log('  ' + String(t).padEnd(24) + 'ERR'); }
  }

  await p.$disconnect();
})().catch(e => { console.log('FATAL', String(e.message).slice(0, 300)); process.exit(1); });
