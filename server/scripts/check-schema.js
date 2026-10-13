require('dotenv').config({ path: 'C:/Users/ARYA/Desktop/EWS-HRMS1/server/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` } }
});
(async () => {
  try {
    const tables = await prisma.$queryRaw`SHOW TABLES`;
    const names = tables.map(t => Object.values(t)[0]).sort();
    console.log('All tables (' + names.length + '):', names.join(', '));

    // Check users table full schema
    const userCols = await prisma.$queryRaw`SHOW COLUMNS FROM users`;
    console.log('\nusers columns:');
    userCols.forEach(c => console.log('  ' + c.Field + ' | ' + c.Type + ' | Null:' + c.Null + ' | Key:' + c.Key));

    // Check if any profile tables exist
    const tableName = process.env.DB_NAME;
    const profileTables = ['super_admin_profiles', 'admin_profiles', 'hr_profiles', 'employee_profiles', 'refresh_tokens', 'password_reset_tokens', 'audit_logs', 'invitation_tokens'];
    for (const t of profileTables) {
      try {
        await prisma.$queryRawUnsafe('SELECT 1 FROM `' + t + '` LIMIT 1');
        console.log(t + ': EXISTS');
      } catch (e) {
        console.log(t + ': DOES NOT EXIST');
      }
    }

    await prisma.$disconnect();
  } catch(e) { console.error('ERROR:', e.message); process.exit(1); }
})();
