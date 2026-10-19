// Runs scripts/create-missing-tables.sql against the configured database.
// Each statement runs in its own query; Prisma's client cannot run batches.
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const sqlFile = path.join(__dirname, '..', 'scripts', 'create-missing-tables.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

// Split on semicolons that terminate a statement (no triggers/functions in this file).
const statements = [];
let current = '';
for (const line of sql.split('\n')) {
  current += line + '\n';
  if (line.trim().endsWith(';')) {
    const stmt = current.trim();
    if (stmt) statements.push(stmt);
    current = '';
  }
}
if (current.trim()) statements.push(current.trim());

const prisma = new PrismaClient();

(async () => {
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log('OK   ' + stmt.split('\n')[0].slice(0, 70));
    } catch (e) {
      console.log('FAIL ' + stmt.split('\n')[0].slice(0, 70));
      console.log('     ' + String(e.message).split('\n')[0]);
    }
  }
  await prisma.$disconnect();
})();
