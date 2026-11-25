-- Salary consolidation: payhead formulas, ESIC number, employee documents.
--
-- 1. salary_payheads.formula — the per-payhead calculation formula used by
--    the Salary tab "Calculate" action (evaluated by the safe formula
--    engine with CTC / MONTHLY_CTC / ANNUAL_CTC + sibling components).
-- 2. employee_payroll_profiles.esicNumber — ESIC number shown when ESI
--    eligibility is enabled on the PF & ESI tab.
-- 3. employee_documents — optional per-employee uploads (Aadhar, PAN,
--    Address Proof, Bank Details, Other 1/2), bytes in the DB like
--    user_avatars so no upload directory is required on the box.
--
-- All steps idempotent: safe to re-run.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'salary_payheads'
    AND COLUMN_NAME = 'formula'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `salary_payheads` ADD COLUMN `formula` TEXT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employee_payroll_profiles'
    AND COLUMN_NAME = 'esicNumber'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `employee_payroll_profiles` ADD COLUMN `esicNumber` VARCHAR(30) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `employee_documents` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `employeeId` INT(11) NOT NULL,
  `kind` VARCHAR(30) NOT NULL,
  `fileName` VARCHAR(255) DEFAULT NULL,
  `mimeType` VARCHAR(40) DEFAULT NULL,
  `data` LONGBLOB NOT NULL,
  `uploadedBy` INT(11) DEFAULT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_emp_doc` (`employeeId`, `kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
