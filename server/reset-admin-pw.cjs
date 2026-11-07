// One-off: reset the password for a user by email (default: admin@earnwealth.in).
// Usage: node reset-admin-pw.cjs [email]
// Loads DB_* from server/.env and connects via Prisma.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const email = process.argv[2] || 'admin@earnwealth.in';
const newPassword = 'Ews#Admin@2026!';

const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;

const p = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const [match] = await p.$queryRawUnsafe(
    'SELECT id, email, role, isActive FROM users WHERE email = ? LIMIT 1',
    email
  );
  if (!match) {
    console.log('NOT FOUND:', email);
    process.exit(1);
  }
  console.log('Found user:', JSON.stringify(match));

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await p.$queryRawUnsafe(
    'UPDATE users SET passwordHash = ?, updatedAt = NOW(3) WHERE email = ?',
    passwordHash,
    email
  );

  // Verify by reading back and comparing
  const [after] = await p.$queryRawUnsafe(
    'SELECT passwordHash FROM users WHERE email = ? LIMIT 1',
    email
  );
  const ok = await bcrypt.compare(newPassword, after.passwordHash);
  console.log('Verify (bcrypt.compare):', ok ? 'MATCH' : 'MISMATCH');
  console.log('---');
  console.log('Email  :', email);
  console.log('Password:', newPassword);
}

main()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
