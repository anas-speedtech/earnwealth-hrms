require('dotenv').config({ path: 'C:/Users/ARYA/Desktop/EWS-HRMS1/server/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` } }
});
(async () => {
  try {
    const cols = await prisma.$queryRaw`SHOW COLUMNS FROM users`;
    console.log('users table columns:', JSON.stringify(cols));
    const row = await prisma.$queryRaw`SELECT * FROM users LIMIT 1`;
    // Redact sensitive fields
    const safe = row.map(r => {
      const { passwordHash, ...rest } = r;
      return { ...rest, passwordHash: '[REDACTED]' };
    });
    console.log('Sample user (sanitized):', JSON.stringify(safe, null, 2));
    await prisma.$disconnect();
  } catch(e) { console.error('ERROR:', e.message); process.exit(1); }
})();
