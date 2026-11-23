-- Employee grade + nullable device enrollment.
--
-- 1. `grade` is a new optional free-text job-grade / band on the employee
--    record. The live table predates it, so add it only when missing.
-- 2. The live `employees.deviceEnrollNo` column is NOT NULL (a legacy
--    biometric slot with a UNIQUE key), but the Prisma model declares it
--    nullable and both create paths insert NULL for employees without a
--    paired device. That mismatch is what 500s the "add employee" flow.
--    Make it nullable so a missing device no longer blocks creation.
--
-- Idempotent: safe to re-run.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'grade'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `grade` VARCHAR(50) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl2 :=
  'ALTER TABLE `employees` MODIFY COLUMN `deviceEnrollNo` INT NULL';
PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
