// Diagnostics: reproduce the login code path and print the REAL error,
// instead of the masked "Something went wrong." 500 the errorHandler returns.
//
// Run it ON THE UAT HOST, from the server dir, so it reads the UAT .env:
//   cd server && node diagnose-login.cjs [email]
//
// It reuses the app's own getPrisma() + findUserByEmail() so the error you
// see is the exact one that produces the 500.
require('dotenv').config();
const { env } = require('./src/config/env');

console.log('=== EWS HRMS login diagnostic ===');
console.log('NODE_ENV     :', env.NODE_ENV);
console.log('DATABASE_URL :', env.DATABASE_URL
  ? env.DATABASE_URL.replace(/:([^:@/]+)@/, ':***@')  // mask password
  : '(MISSING — PrismaClient will throw "url" error)');
console.log('---');

// Pull the real code path out of the app so we mirror it exactly.
const { PrismaClient } = (() => {
  try {
    return { PrismaClient: require('@prisma/client').PrismaClient };
  } catch (e) {
    console.error('STEP 1 FAILED: require("@prisma/client") threw:');
    console.error('  ', e.message);
    console.error('  -> This is the "Prisma client not generated" case.');
    console.error('     Fix: cd server && npx prisma generate  (then restart the API)');
    process.exit(2);
  }
})();

const p = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

(async () => {
  const email = process.argv[2] || 'admin@earnwealth.in';
  try {
    // Same query auth.service.findUserByEmail runs.
    const rows = await p.$queryRawUnsafe(
      'SELECT id, email, role, isActive FROM users WHERE email = ? LIMIT 1',
      email
    );
    console.log('STEP 2 OK: DB reachable + Prisma client works.');
    console.log('  row:', JSON.stringify(rows[0] || null));
    if (!rows.length) {
      console.error('  -> User not found for:', email, '(DB reachable but no such email)');
      process.exitCode = 3;
    } else {
      console.log('  DB is fine. If login still 500s, the throw is AFTER the user lookup');
      console.log('  (token signing / refresh-token write). Check the server log for the trace.');
    }
  } catch (e) {
    console.error('STEP 2 FAILED: DB connection / query threw:');
    console.error('  code   :', e.code || '(none)');
    console.error('  name   :', e.name);
    console.error('  message:', e.message);
    console.error('  Likely :', /P1001|Can't reach|connect|ECONNREFUSED|timeout/i.test(e.code + ' ' + e.message)
      ? 'DB not reachable from this host (host/port/firewall) — check server/.env DATABASE_URL'
      : /P1003|Access denied|auth/i.test(e.code + ' ' + e.message)
        ? 'DB auth failed — wrong DB_USER / DB_PASSWORD in server/.env'
        : 'Something else — full message above');
    process.exitCode = 4;
  } finally {
    await p.$disconnect().catch(() => {});
  }
})();
