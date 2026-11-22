-- Per-period payroll cutoff.
--
-- The last day of the month whose attendance counts toward this period's
-- proration. NULL falls back to PAYROLL_CUTOFF_DAY, then to the full month.
--
-- Idempotent so it is safe to re-run if the column was added by hand.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payroll_periods'
    AND COLUMN_NAME = 'payrollCutoffDay'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `payroll_periods` ADD COLUMN `payrollCutoffDay` INTEGER NULL',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
