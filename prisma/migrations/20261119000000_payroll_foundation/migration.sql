-- Payroll foundation. This migration is additive and safe to run against an
-- installation where the earlier runtime-created salary tables already exist.

CREATE TABLE IF NOT EXISTS `salary_payheads` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` VARCHAR(30) NOT NULL DEFAULT 'EARNING',
  `description` VARCHAR(255) NULL,
  `isFixedByDefault` BOOLEAN NOT NULL DEFAULT false,
  `calculationMethod` VARCHAR(30) NOT NULL DEFAULT 'FIXED',
  `calculationBasis` VARCHAR(30) NULL,
  `taxability` VARCHAR(30) NOT NULL DEFAULT 'FULLY_TAXABLE',
  `pfApplicable` BOOLEAN NOT NULL DEFAULT false,
  `esiApplicable` BOOLEAN NOT NULL DEFAULT false,
  `includeInGross` BOOLEAN NOT NULL DEFAULT true,
  `includeInCTC` BOOLEAN NOT NULL DEFAULT true,
  `recurring` BOOLEAN NOT NULL DEFAULT true,
  `prorateAttendance` BOOLEAN NOT NULL DEFAULT false,
  `displayOnPayslip` BOOLEAN NOT NULL DEFAULT true,
  `minimumAmount` DECIMAL(14,2) NULL,
  `maximumAmount` DECIMAL(14,2) NULL,
  `effectiveFrom` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `effectiveTo` DATE NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `salary_payheads_code_key` (`code`),
  INDEX `salary_payheads_type_isActive_idx` (`type`, `isActive`),
  INDEX `salary_payheads_effectiveFrom_effectiveTo_idx` (`effectiveFrom`, `effectiveTo`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `salary_payheads` (`code`, `name`, `type`, `sortOrder`) VALUES
  ('BASIC', 'Basic Salary', 'EARNING', 1), ('HRA', 'House Rent Allowance', 'EARNING', 2),
  ('DA', 'Dearness Allowance', 'EARNING', 3), ('CBA', 'Conveyance Allowance', 'EARNING', 4),
  ('PF', 'Provident Fund', 'DEDUCTION', 20), ('ESI', 'ESI Contribution', 'DEDUCTION', 21),
  ('PT', 'Professional Tax', 'DEDUCTION', 22), ('TDS', 'Tax Deducted at Source', 'DEDUCTION', 23);

CREATE TABLE IF NOT EXISTS `salary_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `basicPct` DECIMAL(5,2) NOT NULL DEFAULT 50,
  `hraPctOfBasic` DECIMAL(5,2) NOT NULL DEFAULT 30,
  `pfPct` DECIMAL(5,2) NOT NULL DEFAULT 12,
  `pfCap` DECIMAL(14,2) NOT NULL DEFAULT 15000,
  `esicEmployerPct` DECIMAL(5,2) NOT NULL DEFAULT 3.25,
  `esicEmployeePct` DECIMAL(5,2) NOT NULL DEFAULT 0.75,
  `esicWageCeiling` DECIMAL(14,2) NOT NULL DEFAULT 21000,
  `professionTax` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `workingDaysMonth` INT NOT NULL DEFAULT 30,
  `effectiveFrom` DATE NOT NULL DEFAULT (CURRENT_DATE), `effectiveTo` DATE NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true, `notes` TEXT NULL, `createdBy` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `salary_rules_isActive_effectiveFrom_effectiveTo_idx` (`isActive`, `effectiveFrom`, `effectiveTo`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `salary_rules` (`id`, `basicPct`, `hraPctOfBasic`, `pfPct`, `pfCap`, `esicEmployerPct`, `esicEmployeePct`, `esicWageCeiling`, `professionTax`, `workingDaysMonth`)
VALUES (1, 50, 30, 12, 15000, 3.25, 0.75, 21000, 200, 31);

CREATE TABLE IF NOT EXISTS `payroll_statutory_settings` (
  `id` INT NOT NULL AUTO_INCREMENT, `statutoryType` VARCHAR(30) NOT NULL, `stateCode` VARCHAR(10) NULL,
  `employeeRate` DECIMAL(7,4) NOT NULL DEFAULT 0, `employerRate` DECIMAL(7,4) NOT NULL DEFAULT 0,
  `wageBasis` VARCHAR(30) NOT NULL DEFAULT 'GROSS', `wageCeiling` DECIMAL(14,2) NULL,
  `eligibilityJson` TEXT NULL, `configurationJson` TEXT NULL,
  `effectiveFrom` DATE NOT NULL, `effectiveTo` DATE NULL, `isActive` BOOLEAN NOT NULL DEFAULT true, `createdBy` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `payroll_statutory_settings_type_state_active_idx` (`statutoryType`, `stateCode`, `isActive`),
  INDEX `payroll_statutory_settings_effective_idx` (`effectiveFrom`, `effectiveTo`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_payroll_profiles` (
  `id` INT NOT NULL AUTO_INCREMENT, `employeeId` INT NOT NULL, `pan` VARCHAR(20) NULL, `uan` VARCHAR(30) NULL,
  `bankName` VARCHAR(120) NULL, `bankAccountMasked` VARCHAR(40) NULL, `bankIfsc` VARCHAR(20) NULL,
  `taxRegime` VARCHAR(20) NOT NULL DEFAULT 'NEW', `pfApplicable` BOOLEAN NOT NULL DEFAULT true, `esiApplicable` BOOLEAN NOT NULL DEFAULT false,
  `voluntaryPfRate` DECIMAL(7,4) NULL, `salaryOnHold` BOOLEAN NOT NULL DEFAULT false, `holdReason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `employee_payroll_profiles_employeeId_key` (`employeeId`), INDEX `employee_payroll_profiles_pan_idx` (`pan`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_periods` (
  `id` INT NOT NULL AUTO_INCREMENT, `month` INT NOT NULL, `year` INT NOT NULL, `payrollGroup` VARCHAR(100) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'DRAFT', `lockedAt` DATETIME(3) NULL, `lockedBy` INT NULL, `paidAt` DATETIME(3) NULL, `createdBy` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `payroll_periods_month_year_payrollGroup_key` (`month`, `year`, `payrollGroup`),
  INDEX `payroll_periods_year_month_status_idx` (`year`, `month`, `status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_approvals` (
  `id` INT NOT NULL AUTO_INCREMENT, `payrollRecordId` INT NOT NULL, `action` VARCHAR(30) NOT NULL, `comment` VARCHAR(1000) NULL,
  `actedBy` INT NOT NULL, `actedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `payroll_approvals_record_acted_idx` (`payrollRecordId`, `actedAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_loans` (
  `id` INT NOT NULL AUTO_INCREMENT, `employeeId` INT NOT NULL, `loanType` VARCHAR(30) NOT NULL DEFAULT 'LOAN',
  `principalAmount` DECIMAL(14,2) NOT NULL, `outstandingAmount` DECIMAL(14,2) NOT NULL, `emiAmount` DECIMAL(14,2) NOT NULL,
  `startDate` DATE NOT NULL, `endDate` DATE NULL, `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', `createdBy` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `employee_loans_employee_status_idx` (`employeeId`, `status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_loan_repayments` (
  `id` INT NOT NULL AUTO_INCREMENT, `loanId` INT NOT NULL, `payrollRecordId` INT NULL, `amount` DECIMAL(14,2) NOT NULL, `paidOn` DATE NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX `employee_loan_repayments_loan_paid_idx` (`loanId`, `paidOn`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_tax_declarations` (
  `id` INT NOT NULL AUTO_INCREMENT, `employeeId` INT NOT NULL, `financialYear` VARCHAR(10) NOT NULL, `taxRegime` VARCHAR(20) NOT NULL,
  `declarationJson` TEXT NULL, `proofJson` TEXT NULL, `status` VARCHAR(30) NOT NULL DEFAULT 'DRAFT', `submittedAt` DATETIME(3) NULL,
  `verifiedBy` INT NULL, `verifiedAt` DATETIME(3) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `employee_tax_declarations_employee_fy_key` (`employeeId`, `financialYear`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_reimbursements` (
  `id` INT NOT NULL AUTO_INCREMENT, `employeeId` INT NOT NULL, `componentCode` VARCHAR(40) NULL, `claimDate` DATE NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL, `description` VARCHAR(500) NULL, `receiptPath` VARCHAR(500) NULL, `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `approvedBy` INT NULL, `approvedAt` DATETIME(3) NULL, `payrollRecordId` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `employee_reimbursements_employee_status_idx` (`employeeId`, `status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT, `payrollRecordId` INT NULL, `payrollPeriodId` INT NULL, `actorId` INT NULL, `action` VARCHAR(100) NOT NULL,
  `reason` VARCHAR(1000) NULL, `beforeValue` TEXT NULL, `afterValue` TEXT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `payroll_audit_logs_record_created_idx` (`payrollRecordId`, `createdAt`), INDEX `payroll_audit_logs_period_created_idx` (`payrollPeriodId`, `createdAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_input_snapshots` (
  `id` INT NOT NULL AUTO_INCREMENT, `payrollRecordId` INT NOT NULL,
  `totalCalendarDays` INT NOT NULL, `workingDays` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `presentDays` DECIMAL(6,2) NOT NULL DEFAULT 0, `paidLeaveDays` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `unpaidLeaveDays` DECIMAL(6,2) NOT NULL DEFAULT 0, `lopDays` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `halfDays` DECIMAL(6,2) NOT NULL DEFAULT 0, `prorationBasis` VARCHAR(30) NOT NULL DEFAULT 'WORKING_DAYS',
  `prorationFactor` DECIMAL(10,6) NOT NULL DEFAULT 1, `warningsJson` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `payroll_input_snapshots_payrollRecordId_key` (`payrollRecordId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
