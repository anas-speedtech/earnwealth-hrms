-- ============================================================
-- Payroll integrity v2.
--
-- This migration is a NEW, additive layer on top of
-- 20261119000000_payroll_foundation (already deployed to production).
-- The foundation migration is NOT edited here.
--
-- Pre-flight verified against the live database before authoring:
--   * all payroll child tables hold 0 rows and have 0 orphaned keys
--     (checked every FK target below), so adding constraints is safe;
--   * two Prisma-declared columns are missing in the live database,
--     which breaks `createPayroll`/`approvePayroll` at runtime
--     (Unknown column 'reviewComment' / 'salaryComponentId'):
--       - payroll_records.reviewComment
--       - payroll_components.salaryComponentId
--     Both are added here.
--
-- Contents:
--   1. missing Prisma-declared columns
--   2. record/period lifecycle columns (multi-step review, lock, paid, unlock)
--   3. immutable calculation snapshot columns on payroll records
--   4. effective-dated salary structure history (one open structure per
--      employee is enforced in code; the DB allows the revision chain)
--   5. reusable salary templates + one-time adjustments
--   6. foreign keys across the payroll graph and to users (user refs are
--      ON DELETE SET NULL so historical payroll stays intact when an
--      account is deactivated; employee refs follow Prisma's Cascade)

-- ============================================================
-- 0. Normalize legacy runtime-created payroll tables to Prisma's
--    character set / collation (utf8mb4_unicode_ci).
--
--    These six tables pre-date Prisma (created by legacy runtime DDL) and
--    carry utf8mb4_general_ci. MySQL refuses to add a FOREIGN KEY when the
--    child and parent columns use different collations (errno 150) — this
--    is what broke the first attempt of this migration at the
--    `fk_pc_payhead` -> `salary_payheads(code)` constraint. All affected
--    tables are empty except `employee_profiles` (1 row, INT primary key),
--    so the conversion is safe. Re-running is a no-op: CONVERT TO is
--    idempotent for tables already at this collation.
-- ============================================================

ALTER TABLE `payroll_records` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `payroll_components` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `payslips` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `salary_structures` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `salary_structure_components` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `employee_profiles` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================
-- 1. Prisma-declared columns missing from the live database
-- ============================================================

ALTER TABLE `payroll_records`
  ADD COLUMN `reviewComment` VARCHAR(1000) NULL;

ALTER TABLE `payroll_components`
  ADD COLUMN `salaryComponentId` INT NULL;

-- ============================================================
-- 2 + 3. Record lifecycle + immutable snapshot + period link
-- ============================================================

ALTER TABLE `payroll_records`
  ADD COLUMN `periodId` INT NULL,
  ADD COLUMN `lockedAt` DATETIME(3) NULL,
  ADD COLUMN `lockedBy` INT NULL,
  ADD COLUMN `paidAt` DATETIME(3) NULL,
  ADD COLUMN `structureSnapshotJson` TEXT NULL,
  ADD COLUMN `statutorySnapshotJson` TEXT NULL,
  ADD COLUMN `profileSnapshotJson` TEXT NULL,
  ADD COLUMN `adjustmentsJson` TEXT NULL,
  ADD INDEX `idx_pr_periodId` (`periodId`),
  -- Promote the legacy non-unique guard to a hard unique constraint: at most
  -- one payroll calculation per employee per pay month (joiner/exiter
  -- re-runs are handled by correcting the existing record, not by stacking
  -- a second one on top of it).
  DROP INDEX `idx_payroll_records_employee_period`,
  ADD UNIQUE INDEX `idx_payroll_records_employee_period` (`employeeId`, `year`, `month`),
  ADD CONSTRAINT `fk_pr_period` FOREIGN KEY (`periodId`) REFERENCES `payroll_periods` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pr_employee` FOREIGN KEY (`employeeId`) REFERENCES `employee_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pr_structure` FOREIGN KEY (`salaryStructureId`) REFERENCES `salary_structures` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pr_preparedBy` FOREIGN KEY (`preparedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pr_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pr_lockedBy` FOREIGN KEY (`lockedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payroll_components`
  ADD COLUMN `payheadCode` VARCHAR(40) NULL,
  -- No standalone index on payrollRecordId: the live unique index
  -- `idx_payroll_components_record` (payrollRecordId, sortOrder) covers it.
  ADD INDEX `idx_payroll_components_payhead` (`payheadCode`),
  ADD CONSTRAINT `fk_pc_record` FOREIGN KEY (`payrollRecordId`) REFERENCES `payroll_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pc_salaryComponent` FOREIGN KEY (`salaryComponentId`) REFERENCES `salary_structure_components` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pc_payhead` FOREIGN KEY (`payheadCode`) REFERENCES `salary_payheads` (`code`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payslips`
  ADD COLUMN `emailSentAt` DATETIME(3) NULL,
  ADD COLUMN `emailSentTo` VARCHAR(255) NULL,
  ADD COLUMN `emailError` VARCHAR(500) NULL,
  -- No new index on payrollRecordId: the live unique index `uq_payslips_record`
  -- already covers it (one payslip per payroll record).
  ADD CONSTRAINT `fk_ps_record` FOREIGN KEY (`payrollRecordId`) REFERENCES `payroll_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ps_employee` FOREIGN KEY (`employeeId`) REFERENCES `employee_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `payroll_input_snapshots`
  ADD CONSTRAINT `fk_pis_record` FOREIGN KEY (`payrollRecordId`) REFERENCES `payroll_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `payroll_approvals`
  ADD COLUMN `payrollPeriodId` INT NULL,
  ADD INDEX `idx_payroll_approvals_period` (`payrollPeriodId`),
  ADD CONSTRAINT `fk_pa_record` FOREIGN KEY (`payrollRecordId`) REFERENCES `payroll_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pa_period` FOREIGN KEY (`payrollPeriodId`) REFERENCES `payroll_periods` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Period-level review gates + authorized unlock trail.
ALTER TABLE `payroll_periods`
  ADD COLUMN `hrReviewedAt` DATETIME(3) NULL,
  ADD COLUMN `hrReviewedBy` INT NULL,
  ADD COLUMN `financeReviewedAt` DATETIME(3) NULL,
  ADD COLUMN `financeReviewedBy` INT NULL,
  ADD COLUMN `unlockedAt` DATETIME(3) NULL,
  ADD COLUMN `unlockedBy` INT NULL,
  ADD COLUMN `unlockReason` VARCHAR(500) NULL,
  ADD CONSTRAINT `fk_pp_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pp_lockedBy` FOREIGN KEY (`lockedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pp_hrReviewedBy` FOREIGN KEY (`hrReviewedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pp_financeReviewedBy` FOREIGN KEY (`financeReviewedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pp_unlockedBy` FOREIGN KEY (`unlockedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 4. Effective-dated salary structure history + revision chain
-- ============================================================

-- One open structure per employee is enforced in application code by
-- effective-date windows; the previous hard unique key blocked revisions.
ALTER TABLE `salary_structures`
  DROP INDEX `uq_salary_structures_employee`,
  ADD INDEX `idx_salary_structures_employee` (`employeeId`),
  ADD COLUMN `revisionOf` INT NULL,
  ADD COLUMN `revisedBy` INT NULL,
  ADD COLUMN `templateId` INT NULL,
  ADD INDEX `idx_salary_structures_effective` (`effectiveFrom`, `effectiveTo`, `isActive`),
  ADD INDEX `idx_salary_structures_revision` (`revisionOf`),
  ADD CONSTRAINT `fk_ss_employee` FOREIGN KEY (`employeeId`) REFERENCES `employee_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ss_revision` FOREIGN KEY (`revisionOf`) REFERENCES `salary_structures` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ss_revisedBy` FOREIGN KEY (`revisedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `salary_structure_components`
  ADD COLUMN `payheadCode` VARCHAR(40) NULL,
  ADD COLUMN `prorateAttendance` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `calculationBasis` VARCHAR(30) NULL,
  ADD INDEX `idx_ssc_payhead` (`payheadCode`),
  ADD CONSTRAINT `fk_ssc_structure` FOREIGN KEY (`salaryStructureId`) REFERENCES `salary_structures` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ssc_payhead` FOREIGN KEY (`payheadCode`) REFERENCES `salary_payheads` (`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: `salary_payheads.prorateAttendance` was already created by
-- 20261119000000_payroll_foundation, so it is NOT added here.
-- Per-component proration flag on salary_structure_components is added above.

-- Proration basis: WORKING_DAYS (default), CALENDAR_DAYS, FIXED_30, FIXED_31.
ALTER TABLE `salary_rules`
  ADD COLUMN `prorationBasis` VARCHAR(30) NOT NULL DEFAULT 'WORKING_DAYS';

-- ============================================================
-- 5. Reusable salary templates + one-time adjustments
-- ============================================================

CREATE TABLE IF NOT EXISTS `salary_templates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'INR',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdBy` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `salary_templates_code_key` (`code`),
  INDEX `salary_templates_active_idx` (`isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `salary_template_components` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `templateId` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` VARCHAR(20) NOT NULL DEFAULT 'EARNING',
  `calculationType` VARCHAR(30) NOT NULL DEFAULT 'FIXED',
  `amount` DECIMAL(14, 2) NULL,
  `percentage` DECIMAL(5, 2) NULL,
  `formula` VARCHAR(255) NULL,
  `payheadCode` VARCHAR(40) NULL,
  `prorateAttendance` TINYINT(1) NOT NULL DEFAULT 0,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  INDEX `salary_template_components_template_idx` (`templateId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_stc_template` FOREIGN KEY (`templateId`) REFERENCES `salary_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `salary_structures`
  ADD CONSTRAINT `fk_ss_template` FOREIGN KEY (`templateId`) REFERENCES `salary_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `salary_template_components`
  ADD CONSTRAINT `fk_stc_payhead` FOREIGN KEY (`payheadCode`) REFERENCES `salary_payheads` (`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- One-time earnings/deductions: bonuses, incentives, arrears, advances,
-- correction entries. Applied to a payroll run, then linked back to the
-- record that consumed it (payrollRecordId stays null until applied).
CREATE TABLE IF NOT EXISTS `payroll_one_time_adjustments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `employeeId` INT NOT NULL,
  `payrollRecordId` INT NULL,
  `type` VARCHAR(30) NOT NULL DEFAULT 'ONE_TIME_EARNING',
  `amount` DECIMAL(14, 2) NOT NULL,
  `reason` VARCHAR(500) NULL,
  `approvedBy` INT NULL,
  `appliedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `payroll_one_time_adjustments_employee_idx` (`employeeId`),
  INDEX `payroll_one_time_adjustments_record_idx` (`payrollRecordId`),
  INDEX `payroll_one_time_adjustments_type_idx` (`type`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ota_employee` FOREIGN KEY (`employeeId`) REFERENCES `employee_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ota_record` FOREIGN KEY (`payrollRecordId`) REFERENCES `payroll_records` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================
-- 6. Employee statutory/leave context + remaining FKs
-- ============================================================

ALTER TABLE `employee_payroll_profiles`
  ADD COLUMN `stateCode` VARCHAR(10) NULL,
  ADD COLUMN `exitDate` DATE NULL,
  ADD COLUMN `noticePeriodDays` INT NOT NULL DEFAULT 0,
  ADD CONSTRAINT `fk_epp_employee` FOREIGN KEY (`employeeId`) REFERENCES `employee_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_loans`
  ADD CONSTRAINT `fk_el_employee` FOREIGN KEY (`employeeId`) REFERENCES `employee_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_el_createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `employee_loan_repayments`
  ADD CONSTRAINT `fk_elp_loan` FOREIGN KEY (`loanId`) REFERENCES `employee_loans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_elp_record` FOREIGN KEY (`payrollRecordId`) REFERENCES `payroll_records` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `employee_reimbursements`
  ADD CONSTRAINT `fk_er_employee` FOREIGN KEY (`employeeId`) REFERENCES `employee_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_er_record` FOREIGN KEY (`payrollRecordId`) REFERENCES `payroll_records` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_er_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `employee_tax_declarations`
  ADD CONSTRAINT `fk_etd_employee` FOREIGN KEY (`employeeId`) REFERENCES `employee_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_etd_verifiedBy` FOREIGN KEY (`verifiedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payroll_audit_logs`
  ADD CONSTRAINT `fk_pal_record` FOREIGN KEY (`payrollRecordId`) REFERENCES `payroll_records` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pal_period` FOREIGN KEY (`payrollPeriodId`) REFERENCES `payroll_periods` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pal_actor` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
