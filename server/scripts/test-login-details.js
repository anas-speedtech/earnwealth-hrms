require('dotenv').config({ path: 'C:/Users/ARYA/Desktop/EWS-HRMS1/server/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` } }
});
(async () => {
  try {
    // Test 1: Does Prisma handle int ID gracefully when schema expects string?
    console.log('=== Test 1: findUnique by int id (schema expects string UUID) ===');
    try {
      const user = await prisma.user.findUnique({ where: { id: '1' } });
      console.log('Result:', user ? 'FOUND, id=' + user.id + ' (type: ' + typeof user.id + ')' : 'NOT FOUND');
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    // Test 2: Does the refresh token lookup in auth refresh work?
    console.log('\n=== Test 2: user.findUnique with string id from JWT ===');
    try {
      // JWT stores userId as string, so the middleware passes string '1'
      const user = await prisma.user.findUnique({ where: { id: 'some-uuid-from-jwt' } });
      console.log('Result:', user ? 'FOUND' : 'NOT FOUND');
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    // Test 3: Does bcrypt compare work with the stored hash?
    console.log('\n=== Test 3: bcrypt comparison with stored hash ===');
    const bcrypt = require('bcrypt');
    // We know the seed used 'SuperAdmin@123' but the DB has a different hash
    // Test with a known password to see if the stored hash is valid bcrypt
    const testHash = '$2b$12$jwl/bQBqpEBi1f2/wAwb5uyMiQtFNAZDQtIve79/H9q0CesM8BQZu';
    const testPasswords = ['SuperAdmin@123', 'admin@earnwealth.com', 'admin123', 'password', 'admin'];
    for (const pw of testPasswords) {
      const result = await bcrypt.compare(pw, testHash);
      console.log('  Password "' + pw + '" matches:', result);
    }

    await prisma.$disconnect();
  } catch(e) { console.error('ERROR:', e.message); process.exit(1); }
})();
