/**
 * Generates scripts/ensure-prod-leave-designation-tables.sql from the UAT DB:
 * DDL for the 5 raw-SQL tables Prisma does not model, plus config/master
 * rows (leave_types, leave_policies, designations) that prod needs to match.
 *
 * Run while connected to UAT (default .env), then ship the .sql to prod.
 * Usage: node scripts/generate-prod-parity-sql.cjs
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const p = new PrismaClient();

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Date) {
    // Config rows only — audit timestamps; the UTC rendering is fine.
    return "'" + v.toISOString().slice(0, 10) + " 00:00:00.000'";
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  const s = String(v).replace(/\\/g, '\\\\').replace(/'/g, "''");
  return `'${s}'`;
}

async function tableDDL(name) {
  const r = await p.$queryRawUnsafe('SHOW CREATE TABLE ' + name);
  let ddl = r[0]['Create Table'];
  ddl = ddl.replace(/CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ');
  ddl = ddl.replace(/, AUTO_INCREMENT=\d+/g, ''); // drop UAT auto-increment state
  return ddl + ';';
}

async function seedInserts(name) {
  const rows = await p.$queryRawUnsafe('SELECT * FROM ' + name);
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  return rows.map(
    (row) =>
      `INSERT IGNORE INTO ${name} (${cols.map((c) => '`' + c + '`').join(', ')}) VALUES (${cols.map((c) => sqlVal(row[c])).join(', ')});`
  );
}

(async () => {
  const out = [];
  out.push(
    [
      '-- Production table parity: creates the 5 raw-SQL tables Prisma does not model,',
      "-- then seeds config/master data (leave_types, leave_policies, designations).",
      '-- Safe to run on prod after deploying the code. Idempotent (IF NOT EXISTS / INSERT IGNORE).',
      '--',
      '-- NOT included (and why):',
      ' --  user_avatars, payout_details, payout_history, employee_personal_profiles, role_access',
      ' --    => self-create via CREATE TABLE IF NOT EXISTS inside their services on first use.',
      ' --  notifications, attendance_imports, expense_claims',
      ' --    => zero references in current source; skip.',
      ' --  leave_balances',
      " --    => DDL only; seed per-employee DATA with: node scripts/seed-standard-leave-balances.cjs",
    ].join('\n')
  );
  out.push(await tableDDL('leave_types'));
  out.push(await tableDDL('leave_policies'));
  out.push(await tableDDL('designations'));
  out.push(await tableDDL('leave_balances'));
  out.push(await tableDDL('import_batches'));
  out.push('-- config/master data (leave_policies FKs to leave_types.id, so the UAT UUIDs must be copied):');
  out.push(...(await seedInserts('leave_types')));
  out.push(...(await seedInserts('leave_policies')));
  out.push(...(await seedInserts('designations')));

  const file = path.join(__dirname, 'ensure-prod-leave-designation-tables.sql');
  fs.writeFileSync(file, out.join('\n\n') + '\n');
  console.log('wrote ' + file);
  await p.$disconnect();
})().catch((e) => {
  console.error('FAIL', e.message.slice(0, 200));
  process.exit(1);
});
