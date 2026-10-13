// Read-only database preflight check
require('dotenv').config({ path: 'C:/Users/ARYA/Desktop/EWS-HRMS1/server/.env' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    },
  },
});

(async () => {
  try {
    // 1. Confirm connection
    const result = await prisma.$queryRaw`SELECT DATABASE() as db, CONNECTION_ID() as conn`;
    console.log('Connected to database:', JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v));

    // 2. List existing tables
    const tables = await prisma.$queryRaw`SHOW TABLES`;
    console.log('Tables count:', tables.length);
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('Existing tables:', tableNames.join(', '));

    // 3. Check for expected HRMS tables
    const expectedTables = [
      'User', 'Department', 'Designation', 'Attendance', 'WFHRequest',
      'LeaveType', 'LeaveRequest', 'LeaveBalance', 'LeaveTransaction',
      'SalaryStructure', 'PayrollRecord', 'Payslip', 'CompOffCredit',
      'CompOffLedger', 'AuditLog', 'RefreshToken', 'Holiday'
    ];
    const existingTableNames = tables.map(t => Object.values(t)[0].toLowerCase());
    const found = expectedTables.filter(t => existingTableNames.some(e => e === t.toLowerCase()));
    const missing = expectedTables.filter(t => !existingTableNames.some(e => e === t.toLowerCase()));
    console.log('Expected tables found:', found.length, '/', expectedTables.length);
    if (missing.length > 0) console.log('Missing tables:', missing.join(', '));

    // 4. Check _prisma_migrations table
    const migrationTable = tables.find(t => Object.values(t)[0].toLowerCase() === '_prisma_migrations');
    if (migrationTable) {
      try {
        const cols = await prisma.$queryRaw`SHOW COLUMNS FROM _prisma_migrations`;
        const colNames = cols.map(c => c.Field || c.field);
        console.log('_prisma_migrations exists but column mismatch. Columns:', colNames.join(', '));
        // Try V2 column name
        const migrations = await prisma.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at LIMIT 5`;
        console.log('Migration history (V2 format). Count:', migrations.length);
        migrations.forEach(m => console.log('  -', m.migration_name, '|', m.finished_at));
      } catch (e) {
        console.log('Could not read _prisma_migrations:', e.message);
      }
    } else {
      console.log('_prisma_migrations table NOT found');
    }

    // 5. User counts by role (no personal data)
    try {
      const userCounts = await prisma.$queryRaw`
        SELECT role, COUNT(*) as count FROM User GROUP BY role
      `;
      const roleMap = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', HR: 'HR', EMPLOYEE: 'Employee' };
      userCounts.forEach(r => {
        console.log('  ' + (roleMap[r.role] || r.role) + ':', r.count);
      });
    } catch (e) {
      console.log('User table not found — cannot report user counts');
    }

    await prisma.$disconnect();
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
