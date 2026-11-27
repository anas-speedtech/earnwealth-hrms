// One-off generator for the Professional Tax migration SQL (idempotent,
// matching the repo's information_schema self-heal style). Run:
//   node scripts/generate-pt-migration.cjs
const fs = require('fs');
const path = require('path');

const STATUTORY_COLS = [
  ['employeeCategory', 'VARCHAR(20) NULL'],
  ['minimumSalary', 'DECIMAL(14,2) NOT NULL DEFAULT 0'],
  ['maximumSalary', 'DECIMAL(14,2) NULL'],
  ['normalTaxAmount', 'DECIMAL(14,2) NOT NULL DEFAULT 0'],
  ['februaryTaxAmount', 'DECIMAL(14,2) NOT NULL DEFAULT 0'],
  ['legalReference', 'VARCHAR(255) NULL'],
  ['ruleVersion', 'VARCHAR(40) NULL'],
];

const PROFILE_COLS = [
  ['gender', "VARCHAR(10) NULL"],
  ['ptApplicable', 'BOOLEAN NOT NULL DEFAULT TRUE'],
  ['workLocation', 'VARCHAR(100) NULL'],
  ['ptCategory', "VARCHAR(20) NULL"],
  ['ptExempt', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['ptExemptionCategory', 'VARCHAR(50) NULL'],
  ['ptExemptionValidFrom', 'DATETIME(3) NULL'],
  ['ptExemptionValidUntil', 'DATETIME(3) NULL'],
  ['ptExemptionDocument', 'VARCHAR(255) NULL'],
  ['ptExemptionApprovedBy', 'INT(11) NULL'],
  ['ptExemptionStatus', "VARCHAR(20) NULL"],
];

function addColumnBlock(table, col, def) {
  return `-- ${table}.${col}
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${col}');
SET @s := IF(@c = 0, 'ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
`;
}

const lines = [];
lines.push(`-- Professional Tax (PT) module: slab fields on the statutory engine,
-- PT context on the employee payroll profile, and the two PT ledgers
-- (per-period calculation trace + employer filing ledger).
--
-- All steps idempotent: safe to re-run.
`);

for (const [col, def] of STATUTORY_COLS) lines.push(addColumnBlock('payroll_statutory_settings', col, def));
for (const [col, def] of PROFILE_COLS) lines.push(addColumnBlock('employee_payroll_profiles', col, def));

lines.push(`
CREATE TABLE IF NOT EXISTS \`${'payroll_pt_transactions'}\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`employeeId\` INT NOT NULL,
  \`payrollRecordId\` INT NULL,
  \`salaryPeriodMonth\` INT NOT NULL,
  \`salaryPeriodYear\` INT NOT NULL,
  \`salaryPaidDate\` DATE NULL,
  \`stateCode\` VARCHAR(10) NULL,
  \`employeeCategory\` VARCHAR(20) NULL,
  \`taxableSalaryBasis\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`applicableSlabId\` INT NULL,
  \`ruleVersion\` VARCHAR(40) NULL,
  \`normalPT\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`februaryAdjustment\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`exemptionAmount\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`finalPT\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`isExempt\` BOOLEAN NOT NULL DEFAULT FALSE,
  \`exemptionStatus\` VARCHAR(20) NULL,
  \`calculationDetails\` TEXT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY uq_pt_txn_record (\`payrollRecordId\`),
  KEY pt_txn_emp_period_idx (\`employeeId\`, \`salaryPeriodYear\`, \`salaryPeriodMonth\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);

lines.push(`
CREATE TABLE IF NOT EXISTS \`payroll_pt_filings\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`stateCode\` VARCHAR(10) NOT NULL,
  \`financialYearStart\` INT NOT NULL,
  \`filingFrequency\` VARCHAR(20) NOT NULL,
  \`basisLiability\` DECIMAL(14,2) NULL,
  \`totalPTPayable\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`totalPTPaid\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`lastFilingDeadline\` DATE NULL,
  \`nextFilingDeadline\` DATE NULL,
  \`paymentDeadline\` DATE NULL,
  \`lateFeeAmount\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`interestAmount\` DECIMAL(14,2) NOT NULL DEFAULT 0,
  \`filingStatus\` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  \`returnReference\` VARCHAR(100) NULL,
  \`challanReference\` VARCHAR(100) NULL,
  \`filedAt\` DATETIME(3) NULL,
  \`notes\` TEXT NULL,
  \`createdBy\` INT NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY uq_pt_filing_state_fy (\`stateCode\`, \`financialYearStart\`),
  KEY pt_filing_state_status_idx (\`stateCode\`, \`filingStatus\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);

// Seed the Maharashtra slabs (effective 01-04-2023, as amended 2023/2026).
// Rule version pinned so a future legislative change can add a NEW version
// without rewriting history; payroll picks the version active on the pay
// period's date. Slab semantics: salary >= minimumSalary and
// (maximumSalary IS NULL OR salary <= maximumSalary) — the highest crossed
// floor wins.
const SLABS = [
  // [category, min, max, normal, february]
  ['MALE', 0, 7500, 0, 0],
  ['MALE', 7501, 10000, 175, 175],
  ['MALE', 10001, null, 200, 300],
  ['FEMALE', 0, 25000, 0, 0],
  ['FEMALE', 25001, null, 200, 300],
];
for (const [cat, min, max, normal, feb] of SLABS) {
  lines.push(`
-- MH ${cat} slab ${min}-${max ?? '∞'}
SET @seed := (SELECT COUNT(*) FROM payroll_statutory_settings
              WHERE statutoryType = 'PT' AND stateCode = 'MH' AND ruleVersion = 'MH-2023'
                AND employeeCategory = '${cat}' AND minimumSalary = ${min});
SET @s := IF(@seed = 0,
  'INSERT INTO payroll_statutory_settings
     (statutoryType, stateCode, employeeRate, employerRate, wageBasis,
      employeeCategory, minimumSalary, maximumSalary, normalTaxAmount, februaryTaxAmount,
      legalReference, ruleVersion, effectiveFrom, isActive, createdBy)
   VALUES
     (''PT'', ''MH'', 0, 0, ''GROSS'',
      ''${cat}'', ${min}, ${max ?? 'NULL'}, ${normal}, ${feb},
      ''MH Profession Tax Act 1975, Schedule I (amended eff. 01-04-2023)'', ''MH-2023'', '2023-04-01', TRUE, NULL)',
  'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
`);
}

const out = path.join(__dirname, '..', 'prisma', 'migrations', '20261128000000_professional_tax', 'migration.sql');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\n'));
console.log('wrote', out);
