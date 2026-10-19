/* Resets passwordHash for every user so the full 4-role E2E suite can run.
 * New password: EWS@12345  (bcrypt cost 12, matching the project's policy.) */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const NEW_PASSWORD = 'EWS@12345';

(async () => {
  const p = new PrismaClient();
  const hash = await bcrypt.hash(NEW_PASSWORD, 12);

  const r = await p.$executeRawUnsafe(
    'UPDATE users SET passwordHash = ?, updatedAt = NOW(3)',
    hash
  );
  console.log('rows updated:', String(r));

  const check = await p.$queryRawUnsafe(
    "SELECT role, CAST(COUNT(*) AS CHAR) AS n FROM users GROUP BY role ORDER BY role"
  );
  for (const c of check) console.log('  ' + c.role + ' = ' + c.n);

  // round-trip verification
  const u = await p.$queryRawUnsafe('SELECT passwordHash FROM users LIMIT 1');
  const ok = await bcrypt.compare(NEW_PASSWORD, u[0].passwordHash);
  console.log('bcrypt round-trip verify:', ok ? 'PASS' : 'FAIL');

  await p.$disconnect();
})().catch(e => { console.log('FATAL', e.message.slice(0, 300)); process.exit(1); });
