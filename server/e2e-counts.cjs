/* READ-ONLY: how much data already exists, and do the dashboards' key tables have rows? */
const { PrismaClient } = require('@prisma/client');
const TABLES = ['users','employees','departments','designations','attendance_logs','leaves','leave_types','leave_balances','leave_policies','holidays','salary_slips','comp_off_credits','comp_off_ledger','audit_logs'];
(async () => {
  const p = new PrismaClient();
  for (const t of TABLES) {
    try {
      const rows = await p.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${t}\``);
      console.log(t.padEnd(20) + String(rows[0].c));
    } catch (e) {
      console.log(t.padEnd(20) + 'NO TABLE');
    }
  }
  await p.$disconnect();
})().catch(e => { console.log('ERR ' + String(e.message).slice(0,300)); process.exit(1); });
