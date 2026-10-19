/* READ-ONLY: list existing accounts so login can be tested with real credentials. */
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const users = await p.$queryRawUnsafe(
    `SELECT id, email, role, status, is_active FROM users ORDER BY id`);
  console.log('users: ' + users.length);
  for (const u of users) console.log(`  id=${u.id} role=${u.role} status=${u.status} active=${u.is_active} email=${u.email}`);
  await p.$disconnect();
})().catch(e => { console.log('ERR ' + String(e.message).slice(0,300)); process.exit(1); });
