-- Per-employee "works Saturday" flag.
--
-- When TRUE the attendance engine treats Saturday as an ordinary working
-- day for that employee: a missing punch classifies as LWP (leave without
-- pay) instead of being ignored as a weekly off, and punches on Saturday
-- earn no comp-off credit. Sunday remains a weekly off for everyone.
--
-- Idempotent so it is safe to re-run.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'worksSaturday'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `worksSaturday` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
