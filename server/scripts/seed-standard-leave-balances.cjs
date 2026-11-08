/**
 * Seed the standard (non gender-specific) leave types for every active
 * employee so the dashboard / apply-leave screens have "configured" types to
 * show. Idempotent — safe to re-run (skips types that already have a row for
 * the target year).
 *
 * What it does:
 *   1. Sets the annual entitlement for the standard types to sensible
 *      defaults (SICK 8, EARNED 12, PRIVILEGE 2; CASUAL stays unlimited,
 *      UNPAID stays 0) — only where the current entitlement is 0.
 *   2. Creates the leave_balances row for each active employee per type.
 *      Unlimited types get no numeric row (handled separately in the UI).
 *
 * Excluded on purpose: MATERNITY, PATERNITY (gender-specific — configure
 * those per employee in the Add-Employee flow instead).
 *
 * Usage: node scripts/seed-standard-leave-balances.cjs [year]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

// Defaults applied only where the org hasn't set an entitlement (0).
const DEFAULT_ENTITLEMENTS = { SICK: 8, EARNED: 12, PRIVILEGE: 2 };

const p = new PrismaClient();

(async () => {
  const year = Number(process.argv[2]) || new Date().getFullYear();
  const employees = await p.$queryRawUnsafe('SELECT id, employeeCode, name FROM employees WHERE isActive = 1');
  const stdNames = Object.keys(DEFAULT_ENTITLEMENTS);

  // 1) Fill in the standard entitlements where they're still 0.
  for (const name of stdNames) {
    const r = await p.$executeRawUnsafe(
      'UPDATE leave_types SET annualEntitlementDays = ? WHERE name = ? AND (annualEntitlementDays = 0 OR annualEntitlementDays IS NULL)',
      DEFAULT_ENTITLEMENTS[name],
      name
    );
    if (r.changes > 0) console.log(`  set ${name} entitlement -> ${DEFAULT_ENTITLEMENTS[name]}`);
  }

  // 2) Seed balances for the standard set (SICK, EARNED, PRIVILEGE, UNPAID +
  //    CASUAL which is unlimited and skipped for the ledger row).
  const BALANCE_TYPES = ['SICK', 'EARNED', 'PRIVILEGE', 'UNPAID'];
  const types = await p.$queryRawUnsafe(
    'SELECT id, name, annualEntitlementDays FROM leave_types WHERE name IN (' + BALANCE_TYPES.map(() => '?').join(',') + ')',
    ...BALANCE_TYPES
  );
  const byName = Object.fromEntries(types.map((t) => [t.name, t]));

  let created = 0;
  let skipped = 0;
  for (const emp of employees) {
    for (const name of BALANCE_TYPES) {
      const t = byName[name];
      if (!t) continue;
      const exists = await p.$queryRawUnsafe(
        'SELECT id FROM leave_balances WHERE employeeId = ? AND leaveTypeId = ? AND year = ? LIMIT 1',
        emp.id, t.id, year
      );
      if (exists.length) { skipped++; continue; }
      const opening = Number(t.annualEntitlementDays || 0);
      await p.$executeRawUnsafe(
        `INSERT INTO leave_balances
           (id, employeeId, leaveTypeId, openingBalance, accruedBalance, usedBalance, reservedBalance, availableBalance, year, lastAccruedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0.00, 0.00, 0.00, ?, ?, NOW(), NOW(), NOW())`,
        crypto.randomUUID(), emp.id, t.id, opening, opening, year
      );
      created++;
    }
    console.log(`  ${emp.name} (${emp.employeeCode}): configured [${BALANCE_TYPES.join(', ')}] + CASUAL (unlimited)`);
  }

  console.log(`\nyear=${year} employees=${employees.length} balance rows created=${created} skipped=${skipped}`);
  await p.$disconnect();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
