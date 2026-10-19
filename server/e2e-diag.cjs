/* READ-ONLY: current users + row counts, for test planning. */
const { PrismaClient } = require('@prisma/client');
const TABLES = ['users','employees','departments','designations','attendance_logs','leaves','leave_types','leave_balances','leave_policies','holidays','salary_slips','comp_off_credits','comp_off_ledger','audit_logs','wfh_requests','comp_off_leave','notifications'];
(async () => {
  const p = new PrismaClient();
  console.log('=== USERS ===');
  const users = await p.$queryRawUnsafe(`SELECT id, email, role, status, is_active FROM users ORDER BY id`);
  for (const u of users) console.log(`  id=${u.id} role=${u.role} status=${u.status} active=${u.is_active} ${u.email}`);
  console.log('\n=== ROW COUNTS ===');
  for (const t of TABLES) {
    try {
      const rows = await p.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${t}\``);
      console.log(`  ${t.padEnd(18)} ${rows[0].c}`);
    } catch { console.log(`  ${t.padEnd(18)} NO TABLE`); }
  }
  await p.$disconnect();
})().catch(e => { console.log('ERR ' + String(e.message).slice(0,400)); process.exit(1); });
