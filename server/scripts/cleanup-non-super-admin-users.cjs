/**
 * One-off cleanup: delete every user whose role is NOT 'SUPER_ADMIN', together
 * with their linked employee / token / profile rows.
 *
 * The user's request was: "remove all existing users except Super Admin —
 * once Super Admin is set, we will process the following user creation."
 *
 * What it removes:
 *   - users        where role <> 'SUPER_ADMIN'
 *   - employee_profiles / refresh_tokens / password_reset_tokens of those users
 *   - employees    that are not linked to a remaining Super Admin user
 *
 * What it keeps:
 *   - users where role = 'SUPER_ADMIN'  (ids 1 and 12 in the current data:
 *     admin@earnwealth.com and e2e.sa@earnwealth.com)
 *
 * How to run (from the server/ directory):
 *   node scripts/cleanup-non-super-admin-users.cjs
 *
 * The delete is wrapped in a single transaction, so if any step fails the
 * whole operation rolls back.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const KEEP_SUPER_ADMIN_IDS = [1, 12]; // adjust if you know your Super Admin ids differ

(async () => {
  const prisma = new PrismaClient();

  const doomed = await prisma.$queryRawUnsafe(
    `SELECT id FROM users WHERE role <> 'SUPER_ADMIN'`
  );
  const doomedIds = doomed.map((r) => Number(r.id));
  console.log(`Removing ${doomedIds.length} non-Super-Admin user(s):`, doomedIds.join(', '));

  // Employees that are not linked to a Super Admin user are removed even when
  // there is nothing to delete in the users table.
  const keepPlaceholder = KEEP_SUPER_ADMIN_IDS.map(() => '?').join(',');
  await prisma.$executeRawUnsafe(
    `DELETE FROM employees WHERE userId IS NULL OR userId NOT IN (${keepPlaceholder})`,
    ...KEEP_SUPER_ADMIN_IDS
  );

  if (doomedIds.length === 0) {
    const remaining = await prisma.$queryRawUnsafe('SELECT id, name, email, role FROM users ORDER BY id');
    console.log('No non-Super-Admin users to remove. Remaining users:');
    console.table(remaining);
    const empCount = (await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM employees'))[0].c;
    console.log('employees now:', empCount);
    await prisma.$disconnect();
    console.log('Done.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const placeholder = doomedIds.map(() => '?').join(',');

    // 1. Children first (no cascade from users in the live schema).
    await tx.$executeRawUnsafe(
      `DELETE FROM employee_profiles WHERE userId IN (${placeholder})`,
      ...doomedIds
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM refresh_tokens WHERE userId IN (${placeholder})`,
      ...doomedIds
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM password_reset_tokens WHERE userId IN (${placeholder})`,
      ...doomedIds
    );

    // 2. The user rows themselves.
    await tx.$executeRawUnsafe(`DELETE FROM users WHERE id IN (${placeholder})`, ...doomedIds);
  });

  const remaining = await prisma.$queryRawUnsafe(
    'SELECT id, name, email, role FROM users ORDER BY id'
  );
  console.log('Remaining users:');
  console.table(remaining);

  const empCount = (await prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM employees'))[0].c;
  console.log('employees now:', empCount);

  await prisma.$disconnect();
  console.log('Done.');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
