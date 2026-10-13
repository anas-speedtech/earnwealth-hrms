require('dotenv').config({ path: 'C:/Users/ARYA/Desktop/EWS-HRMS1/server/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` } }
});
(async () => {
  try {
    // Simulate exactly what AuthService.login does:
    // 1. findUnique with include for profiles
    console.log('=== Test 1: findUnique with includes (exact login flow) ===');
    try {
      const user = await prisma.user.findUnique({
        where: { email: 'admin@earnwealth.com' },
        include: {
          superAdminProfile: true,
          adminProfile: true,
          hrProfile: true,
          employeeProfile: true,
        },
      });
      console.log('Result:', user ? 'FOUND (id=' + user.id + ', role=' + user.role + ', status=' + user.status + ')' : 'NOT FOUND');
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    // 2. findUnique WITHOUT includes
    console.log('\n=== Test 2: findUnique without includes ===');
    try {
      const user = await prisma.user.findUnique({
        where: { email: 'admin@earnwealth.com' },
      });
      console.log('Result:', user ? 'FOUND (id=' + user.id + ', role=' + user.role + ', status=' + user.status + ')' : 'NOT FOUND');
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    // 3. Raw query matching what Prisma would generate
    console.log('\n=== Test 3: Raw query with status column ===');
    try {
      const user = await prisma.$queryRaw`SELECT id, email, passwordHash, role, status FROM users WHERE email = 'admin@earnwealth.com' LIMIT 1`;
      console.log('Result:', JSON.stringify(user));
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    // 4. Raw query with isActive column (existing DB column)
    console.log('\n=== Test 4: Raw query with isActive column (DB reality) ===');
    try {
      const user = await prisma.$queryRaw`SELECT id, email, passwordHash, role, isActive FROM users WHERE email = 'admin@earnwealth.com' LIMIT 1`;
      console.log('Result:', JSON.stringify(user));
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    // 5. Check if refreshToken.create works (needed by login)
    console.log('\n=== Test 5: refreshToken.create (needed by login) ===');
    try {
      await prisma.refreshToken.create({
        data: { userId: '1', tokenHash: 'test', expiresAt: new Date() },
      });
      console.log('SUCCESS');
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    // 6. Check if auditLog.create works (needed by login)
    console.log('\n=== Test 6: auditLog.create (needed by login) ===');
    try {
      await prisma.auditLog.create({
        data: { actorId: '1', actorRole: 'SUPER_ADMIN', action: 'LOGIN', entityType: 'User', entityId: '1' },
      });
      console.log('SUCCESS');
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    // 7. Check if refresh_tokens table exists
    console.log('\n=== Test 7: refreshTokens table existence ===');
    try {
      await prisma.$queryRaw`SELECT 1 FROM refresh_tokens LIMIT 1`;
      console.log('refresh_tokens table EXISTS');
    } catch (e) {
      console.log('refresh_tokens table DOES NOT EXIST');
    }

    // 8. Check if audit_logs table exists
    console.log('\n=== Test 8: auditLogs table existence ===');
    try {
      await prisma.$queryRaw`SELECT 1 FROM audit_logs LIMIT 1`;
      console.log('audit_logs table EXISTS');
    } catch (e) {
      console.log('audit_logs table DOES NOT EXIST');
    }

    // 9. Check if user.update for lastLoginAt works (schema compat)
    console.log('\n=== Test 9: user.update (schema compat for lastLoginAt) ===');
    try {
      await prisma.user.update({
        where: { id: '1' },
        data: { lastLoginAt: new Date() },
      });
      console.log('SUCCESS');
    } catch (e) {
      console.log('FAILED:', e.message);
    }

    await prisma.$disconnect();
  } catch(e) { console.error('ERROR:', e.message); process.exit(1); }
})();
