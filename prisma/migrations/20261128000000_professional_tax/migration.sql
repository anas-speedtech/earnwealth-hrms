-- Professional Tax (PT) module: slab fields on the statutory engine,
-- PT context on the employee payroll profile, and the two PT ledgers
-- (per-period calculation trace + employer filing ledger).
--
-- All steps idempotent: safe to re-run.

-- payroll_statutory_settings.employeeCategory
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_statutory_settings' AND COLUMN_NAME = 'employeeCategory');
SET @s := IF(@c = 0, 'ALTER TABLE `payroll_statutory_settings` ADD COLUMN `employeeCategory` VARCHAR(20) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- payroll_statutory_settings.minimumSalary
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_statutory_settings' AND COLUMN_NAME = 'minimumSalary');
SET @s := IF(@c = 0, 'ALTER TABLE `payroll_statutory_settings` ADD COLUMN `minimumSalary` DECIMAL(14,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- payroll_statutory_settings.maximumSalary
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_statutory_settings' AND COLUMN_NAME = 'maximumSalary');
SET @s := IF(@c = 0, 'ALTER TABLE `payroll_statutory_settings` ADD COLUMN `maximumSalary` DECIMAL(14,2) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- payroll_statutory_settings.normalTaxAmount
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_statutory_settings' AND COLUMN_NAME = 'normalTaxAmount');
SET @s := IF(@c = 0, 'ALTER TABLE `payroll_statutory_settings` ADD COLUMN `normalTaxAmount` DECIMAL(14,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- payroll_statutory_settings.februaryTaxAmount
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_statutory_settings' AND COLUMN_NAME = 'februaryTaxAmount');
SET @s := IF(@c = 0, 'ALTER TABLE `payroll_statutory_settings` ADD COLUMN `februaryTaxAmount` DECIMAL(14,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- payroll_statutory_settings.legalReference
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_statutory_settings' AND COLUMN_NAME = 'legalReference');
SET @s := IF(@c = 0, 'ALTER TABLE `payroll_statutory_settings` ADD COLUMN `legalReference` VARCHAR(255) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- payroll_statutory_settings.ruleVersion
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_statutory_settings' AND COLUMN_NAME = 'ruleVersion');
SET @s := IF(@c = 0, 'ALTER TABLE `payroll_statutory_settings` ADD COLUMN `ruleVersion` VARCHAR(40) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.gender
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'gender');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `gender` VARCHAR(10) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptApplicable
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptApplicable');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptApplicable` BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.workLocation
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'workLocation');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `workLocation` VARCHAR(100) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptCategory
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptCategory');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptCategory` VARCHAR(20) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptExempt
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptExempt');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptExempt` BOOLEAN NOT NULL DEFAULT FALSE', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptExemptionCategory
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptExemptionCategory');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptExemptionCategory` VARCHAR(50) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptExemptionValidFrom
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptExemptionValidFrom');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptExemptionValidFrom` DATETIME(3) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptExemptionValidUntil
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptExemptionValidUntil');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptExemptionValidUntil` DATETIME(3) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptExemptionDocument
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptExemptionDocument');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptExemptionDocument` VARCHAR(255) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptExemptionApprovedBy
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptExemptionApprovedBy');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptExemptionApprovedBy` INT(11) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;

-- employee_payroll_profiles.ptExemptionStatus
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_payroll_profiles' AND COLUMN_NAME = 'ptExemptionStatus');
SET @s := IF(@c = 0, 'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `ptExemptionStatus` VARCHAR(20) NULL', 'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


CREATE TABLE IF NOT EXISTS `payroll_pt_transactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `employeeId` INT NOT NULL,
  `payrollRecordId` INT NULL,
  `salaryPeriodMonth` INT NOT NULL,
  `salaryPeriodYear` INT NOT NULL,
  `salaryPaidDate` DATE NULL,
  `stateCode` VARCHAR(10) NULL,
  `employeeCategory` VARCHAR(20) NULL,
  `taxableSalaryBasis` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `applicableSlabId` INT NULL,
  `ruleVersion` VARCHAR(40) NULL,
  `normalPT` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `februaryAdjustment` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `exemptionAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `finalPT` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `isExempt` BOOLEAN NOT NULL DEFAULT FALSE,
  `exemptionStatus` VARCHAR(20) NULL,
  `calculationDetails` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY uq_pt_txn_record (`payrollRecordId`),
  KEY pt_txn_emp_period_idx (`employeeId`, `salaryPeriodYear`, `salaryPeriodMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `payroll_pt_filings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `stateCode` VARCHAR(10) NOT NULL,
  `financialYearStart` INT NOT NULL,
  `filingFrequency` VARCHAR(20) NOT NULL,
  `basisLiability` DECIMAL(14,2) NULL,
  `totalPTPayable` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `totalPTPaid` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `lastFilingDeadline` DATE NULL,
  `nextFilingDeadline` DATE NULL,
  `paymentDeadline` DATE NULL,
  `lateFeeAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `interestAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `filingStatus` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `returnReference` VARCHAR(100) NULL,
  `challanReference` VARCHAR(100) NULL,
  `filedAt` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdBy` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY uq_pt_filing_state_fy (`stateCode`, `financialYearStart`),
  KEY pt_filing_state_status_idx (`stateCode`, `filingStatus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- MH MALE slab 0-7500
SET @seed := (SELECT COUNT(*) FROM payroll_statutory_settings
              WHERE statutoryType = 'PT' AND stateCode = 'MH' AND ruleVersion = 'MH-2023'
                AND employeeCategory = 'MALE' AND minimumSalary = 0);
SET @s := IF(@seed = 0,
  'INSERT INTO payroll_statutory_settings
     (statutoryType, stateCode, employeeRate, employerRate, wageBasis,
      employeeCategory, minimumSalary, maximumSalary, normalTaxAmount, februaryTaxAmount,
      legalReference, ruleVersion, effectiveFrom, isActive, createdBy)
   VALUES
     (''PT'', ''MH'', 0, 0, ''GROSS'',
      ''MALE'', 0, 7500, 0, 0,
      ''MH Profession Tax Act 1975, Schedule I (amended eff. 01-04-2023)'', ''MH-2023'', '2023-04-01', TRUE, NULL)',
  'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- MH MALE slab 7501-10000
SET @seed := (SELECT COUNT(*) FROM payroll_statutory_settings
              WHERE statutoryType = 'PT' AND stateCode = 'MH' AND ruleVersion = 'MH-2023'
                AND employeeCategory = 'MALE' AND minimumSalary = 7501);
SET @s := IF(@seed = 0,
  'INSERT INTO payroll_statutory_settings
     (statutoryType, stateCode, employeeRate, employerRate, wageBasis,
      employeeCategory, minimumSalary, maximumSalary, normalTaxAmount, februaryTaxAmount,
      legalReference, ruleVersion, effectiveFrom, isActive, createdBy)
   VALUES
     (''PT'', ''MH'', 0, 0, ''GROSS'',
      ''MALE'', 7501, 10000, 175, 175,
      ''MH Profession Tax Act 1975, Schedule I (amended eff. 01-04-2023)'', ''MH-2023'', '2023-04-01', TRUE, NULL)',
  'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- MH MALE slab 10001-∞
SET @seed := (SELECT COUNT(*) FROM payroll_statutory_settings
              WHERE statutoryType = 'PT' AND stateCode = 'MH' AND ruleVersion = 'MH-2023'
                AND employeeCategory = 'MALE' AND minimumSalary = 10001);
SET @s := IF(@seed = 0,
  'INSERT INTO payroll_statutory_settings
     (statutoryType, stateCode, employeeRate, employerRate, wageBasis,
      employeeCategory, minimumSalary, maximumSalary, normalTaxAmount, februaryTaxAmount,
      legalReference, ruleVersion, effectiveFrom, isActive, createdBy)
   VALUES
     (''PT'', ''MH'', 0, 0, ''GROSS'',
      ''MALE'', 10001, NULL, 200, 300,
      ''MH Profession Tax Act 1975, Schedule I (amended eff. 01-04-2023)'', ''MH-2023'', '2023-04-01', TRUE, NULL)',
  'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- MH FEMALE slab 0-25000
SET @seed := (SELECT COUNT(*) FROM payroll_statutory_settings
              WHERE statutoryType = 'PT' AND stateCode = 'MH' AND ruleVersion = 'MH-2023'
                AND employeeCategory = 'FEMALE' AND minimumSalary = 0);
SET @s := IF(@seed = 0,
  'INSERT INTO payroll_statutory_settings
     (statutoryType, stateCode, employeeRate, employerRate, wageBasis,
      employeeCategory, minimumSalary, maximumSalary, normalTaxAmount, februaryTaxAmount,
      legalReference, ruleVersion, effectiveFrom, isActive, createdBy)
   VALUES
     (''PT'', ''MH'', 0, 0, ''GROSS'',
      ''FEMALE'', 0, 25000, 0, 0,
      ''MH Profession Tax Act 1975, Schedule I (amended eff. 01-04-2023)'', ''MH-2023'', '2023-04-01', TRUE, NULL)',
  'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;


-- MH FEMALE slab 25001-∞
SET @seed := (SELECT COUNT(*) FROM payroll_statutory_settings
              WHERE statutoryType = 'PT' AND stateCode = 'MH' AND ruleVersion = 'MH-2023'
                AND employeeCategory = 'FEMALE' AND minimumSalary = 25001);
SET @s := IF(@seed = 0,
  'INSERT INTO payroll_statutory_settings
     (statutoryType, stateCode, employeeRate, employerRate, wageBasis,
      employeeCategory, minimumSalary, maximumSalary, normalTaxAmount, februaryTaxAmount,
      legalReference, ruleVersion, effectiveFrom, isActive, createdBy)
   VALUES
     (''PT'', ''MH'', 0, 0, ''GROSS'',
      ''FEMALE'', 25001, NULL, 200, 300,
      ''MH Profession Tax Act 1975, Schedule I (amended eff. 01-04-2023)'', ''MH-2023'', '2023-04-01', TRUE, NULL)',
  'SELECT 1');
PREPARE p FROM @s; EXECUTE p; DEALLOCATE PREPARE p;
