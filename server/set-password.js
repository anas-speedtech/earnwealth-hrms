require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

// Usage: node set-password.js <email> <newPassword>
// The password is read from the command line only. It is never written to a
// file, never logged, and only its bcrypt hash is stored.

const [email, newPassword] = process.argv.slice(2);

if (!email || !newPassword) {
  console.error('usage: node set-password.js <email> <newPassword>');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error('password must be at least 8 characters');
  process.exit(1);
}

const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;

const p = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  // Tagged templates bind parameters safely and are what the rest of the
  // service layer uses against this MySQL deployment.
  const rows = await p.$queryRaw`
    SELECT id, email, role, isActive FROM users WHERE email = ${email} LIMIT 1
  `;

  if (!rows || rows.length === 0) {
    console.error('no user found with email: ' + email);
    await p.$disconnect();
    process.exit(1);
  }

  const user = rows[0];
  if (!user.isActive) {
    console.error('that account is inactive (isActive = 0)');
    await p.$disconnect();
    process.exit(1);
  }

  // Always hash what was passed on the command line. Never reuse a hash.
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await p.$executeRaw`
    UPDATE users SET passwordHash = ${passwordHash}, updatedAt = NOW(3) WHERE id = ${user.id}
  `;

  // Verify the new hash actually matches before reporting success.
  const check = await p.$queryRaw`
    SELECT passwordHash FROM users WHERE id = ${user.id} LIMIT 1
  `;
  const ok = await bcrypt.compare(newPassword, String(check[0].passwordHash));

  console.log('user id      : ' + user.id);
  console.log('email        : ' + user.email);
  console.log('role         : ' + user.role);
  console.log('hash verify  : ' + (ok ? 'PASS' : 'FAIL'));

  await p.$disconnect();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('ERR: ' + e.message);
  process.exit(1);
});
