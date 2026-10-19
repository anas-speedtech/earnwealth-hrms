// Reproduces the payroll failure from the browser, end to end, so the real
// error is visible rather than guessed at.
//
// Usage: node check-payroll.js <password>

require('dotenv').config();
const { AuthService, setupTestPrisma, resetPrisma } = require('./src/services/auth.service');
const { PrismaClient } = require('@prisma/client');

const password = process.argv[2];
if (!password) {
  console.error('usage: node check-payroll.js <your-current-password>');
  process.exit(1);
}

const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;

const p = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  setupTestPrisma(p);

  let session;
  try {
    session = await AuthService.login({ email: 'admin@earnwealth.com', password });
    console.log('login: OK role=' + session.user.role);
  } catch (e) {
    console.log('login FAILED: ' + e.code + ' — that password is not current.');
    resetPrisma();
    await p.$disconnect();
    process.exit(1);
  }
  resetPrisma();

  // Now call the payroll endpoint exactly as the browser does.
  const base = 'http://localhost:5000/api/payroll/records';
  const paths = [base, base + '?status=PENDING_APPROVAL', base + '?month=2026-10'];

  for (const path of paths) {
    const res = await fetch(path, {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    console.log('');
    console.log('GET ' + path.replace('http://localhost:5000', ''));
    console.log('  HTTP ' + res.status);
    if (body && body.error) {
      console.log('  code    : ' + body.error.code);
      console.log('  message : ' + body.error.message);
    } else if (body) {
      console.log('  records : ' + (Array.isArray(body) ? body.length : JSON.stringify(body).slice(0, 200)));
    }
  }

  await p.$disconnect();
})().catch((e) => {
  console.error('ERR: ' + e.message);
  process.exit(1);
});
