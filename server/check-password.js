require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;

const p = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  const rows = await p.$queryRaw`
    SELECT id, email, role, isActive, passwordHash, updatedAt FROM users WHERE email = 'admin@earnwealth.com' LIMIT 1
  `;
  if (!rows.length) {
    console.log('no such user');
    await p.$disconnect();
    return;
  }
  const u = rows[0];
  console.log('user id    : ' + u.id);
  console.log('email      : ' + u.email);
  console.log('role       : ' + u.role);
  console.log('isActive   : ' + u.isActive);
  console.log('updatedAt  : ' + u.updatedAt.toISOString());
  console.log('hash prefix: ' + String(u.passwordHash).slice(0, 7));

  // Which known candidate password matches the stored hash?
  const candidates = ['Admin@12345', 'Admin@99999'];
  for (const c of candidates) {
    const ok = await bcrypt.compare(c, String(u.passwordHash));
    console.log('matches "' + c + '": ' + ok);
  }

  await p.$disconnect();
})().catch((e) => {
  console.error('ERR: ' + e.message);
  process.exit(1);
});
