-- EWS HRMS production backup (DDL)
-- taken 2026-11-20T03:25:50.044Z
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `attendance_corrections`;
CREATE TABLE IF NOT EXISTS `attendance_corrections` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `attendanceId` int(11) NOT NULL,
  `employeeId` int(11) NOT NULL,
  `originalPunchIn` datetime(3) DEFAULT NULL,
  `originalPunchOut` datetime(3) DEFAULT NULL,
  `originalStatus` varchar(10) NOT NULL DEFAULT 'UNKNOWN',
  `correctedPunchIn` datetime(3) DEFAULT NULL,
  `correctedPunchOut` datetime(3) DEFAULT NULL,
  `correctedStatus` varchar(10) NOT NULL DEFAULT 'UNKNOWN',
  `reason` varchar(500) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `reviewComment` varchar(255) DEFAULT NULL,
  `reviewedBy` int(11) DEFAULT NULL,
  `reviewedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_attendance_corrections_attendance` (`attendanceId`),
  KEY `idx_attendance_corrections_employee` (`employeeId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `attendance_imports`;
CREATE TABLE IF NOT EXISTS `attendance_imports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `importedBy` int(11) NOT NULL,
  `importedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `rowCount` int(11) NOT NULL DEFAULT 0,
  `note` varchar(255) DEFAULT NULL,
  `fileName` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `attendance_logs`;
CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `punchTime` datetime NOT NULL,
  `status` enum('IN','OUT','UNKNOWN','PRESENT','PARTIAL','MISSED_PUNCH') NOT NULL DEFAULT 'UNKNOWN',
  `source` enum('DAT','MANUAL') NOT NULL DEFAULT 'MANUAL',
  `importBatchId` int(11) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `attendance_logs_employeeId_punchTime_key` (`employeeId`,`punchTime`),
  KEY `attendance_logs_employeeId_punchTime_idx` (`employeeId`,`punchTime`),
  KEY `attendance_logs_punchTime_idx` (`punchTime`),
  KEY `attendance_logs_importBatchId_idx` (`importBatchId`),
  CONSTRAINT `attendance_logs_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `attendance_logs_importBatchId_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `import_batches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2845 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` varchar(191) NOT NULL,
  `actorId` varchar(191) DEFAULT NULL,
  `actorRole` varchar(191) NOT NULL,
  `action` varchar(191) NOT NULL,
  `entityType` varchar(191) NOT NULL,
  `entityId` varchar(191) NOT NULL,
  `beforeValue` text DEFAULT NULL,
  `afterValue` text DEFAULT NULL,
  `metadata` text DEFAULT NULL,
  `ipAddress` varchar(191) DEFAULT NULL,
  `userAgent` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `audit_logs_actorId_createdAt_idx` (`actorId`,`createdAt`),
  KEY `audit_logs_entityType_entityId_idx` (`entityType`,`entityId`),
  KEY `audit_logs_action_idx` (`action`),
  KEY `audit_logs_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `comp_off_credits`;
CREATE TABLE IF NOT EXISTS `comp_off_credits` (
  `id` varchar(191) NOT NULL,
  `employeeId` int(11) NOT NULL,
  `sourceDate` date NOT NULL,
  `earnedDays` decimal(5,2) NOT NULL DEFAULT 1.00,
  `usedDays` decimal(5,2) NOT NULL DEFAULT 0.00,
  `status` varchar(20) NOT NULL DEFAULT 'AVAILABLE',
  `expiresAt` date NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `approvedBy` varchar(191) DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `comp_off_credits_employeeId_sourceDate_key` (`employeeId`,`sourceDate`),
  KEY `comp_off_credits_employeeId_idx` (`employeeId`),
  CONSTRAINT `comp_off_credits_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `comp_off_ledger`;
CREATE TABLE IF NOT EXISTS `comp_off_ledger` (
  `id` varchar(191) NOT NULL,
  `creditId` varchar(191) NOT NULL,
  `employeeId` int(11) NOT NULL,
  `type` varchar(20) NOT NULL,
  `amount` decimal(5,2) NOT NULL,
  `balanceAfter` decimal(5,2) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `comp_off_ledger_creditId_idx` (`creditId`),
  KEY `comp_off_ledger_employeeId_idx` (`employeeId`),
  CONSTRAINT `comp_off_ledger_creditId_fkey` FOREIGN KEY (`creditId`) REFERENCES `comp_off_credits` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comp_off_ledger_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `comp_off_policy`;
CREATE TABLE IF NOT EXISTS `comp_off_policy` (
  `id` varchar(191) NOT NULL,
  `expiryMonths` int(11) NOT NULL DEFAULT 3,
  `minWorkedHours` decimal(4,2) NOT NULL DEFAULT 4.00,
  `maxDaysPerMonth` int(11) NOT NULL DEFAULT 2,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `departments`;
CREATE TABLE IF NOT EXISTS `departments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `headId` int(11) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `departments_name_key` (`name`),
  KEY `departments_name_idx` (`name`),
  KEY `departments_headId_fkey` (`headId`),
  CONSTRAINT `departments_headId_fkey` FOREIGN KEY (`headId`) REFERENCES `employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `designations`;
CREATE TABLE IF NOT EXISTS `designations` (
  `id` varchar(191) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `designations_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `employees`;
CREATE TABLE IF NOT EXISTS `employees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `userId` int(11) DEFAULT NULL,
  `employeeCode` varchar(50) NOT NULL,
  `name` varchar(120) NOT NULL,
  `designation` varchar(100) NOT NULL,
  `joiningDate` date NOT NULL,
  `deviceEnrollNo` int(11) NOT NULL,
  `basicSalary` decimal(12,2) NOT NULL,
  `allowances` decimal(12,2) NOT NULL DEFAULT 0.00,
  `deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  `departmentId` int(11) DEFAULT NULL,
  `departmentText` varchar(100) DEFAULT NULL,
  `reportingManagerId` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employees_employeeCode_key` (`employeeCode`),
  UNIQUE KEY `employees_deviceEnrollNo_key` (`deviceEnrollNo`),
  UNIQUE KEY `employees_userId_key` (`userId`),
  KEY `employees_userId_idx` (`userId`),
  KEY `employees_deviceEnrollNo_idx` (`deviceEnrollNo`),
  KEY `employees_employeeCode_idx` (`employeeCode`),
  KEY `employees_departmentId_idx` (`departmentId`),
  KEY `idx_reporting_manager` (`reportingManagerId`),
  CONSTRAINT `employees_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `employees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_reporting_manager` FOREIGN KEY (`reportingManagerId`) REFERENCES `employees` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `employee_loans`;
CREATE TABLE IF NOT EXISTS `employee_loans` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `loanType` varchar(30) NOT NULL DEFAULT 'LOAN',
  `principalAmount` decimal(14,2) NOT NULL,
  `outstandingAmount` decimal(14,2) NOT NULL,
  `emiAmount` decimal(14,2) NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'ACTIVE',
  `createdBy` int(11) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `employee_loans_employee_status_idx` (`employeeId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `employee_loan_repayments`;
CREATE TABLE IF NOT EXISTS `employee_loan_repayments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `loanId` int(11) NOT NULL,
  `payrollRecordId` int(11) DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `paidOn` date NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `employee_loan_repayments_loan_paid_idx` (`loanId`,`paidOn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `employee_payroll_profiles`;
CREATE TABLE IF NOT EXISTS `employee_payroll_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `pan` varchar(20) DEFAULT NULL,
  `uan` varchar(30) DEFAULT NULL,
  `bankName` varchar(120) DEFAULT NULL,
  `bankAccountMasked` varchar(40) DEFAULT NULL,
  `bankIfsc` varchar(20) DEFAULT NULL,
  `taxRegime` varchar(20) NOT NULL DEFAULT 'NEW',
  `pfApplicable` tinyint(1) NOT NULL DEFAULT 1,
  `esiApplicable` tinyint(1) NOT NULL DEFAULT 0,
  `voluntaryPfRate` decimal(7,4) DEFAULT NULL,
  `salaryOnHold` tinyint(1) NOT NULL DEFAULT 0,
  `holdReason` varchar(500) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_payroll_profiles_employeeId_key` (`employeeId`),
  KEY `employee_payroll_profiles_pan_idx` (`pan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `employee_personal_profiles`;
CREATE TABLE IF NOT EXISTS `employee_personal_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeCode` varchar(50) NOT NULL,
  `address` varchar(500) DEFAULT NULL,
  `dateOfBirth` date DEFAULT NULL,
  `emergencyContact` varchar(100) DEFAULT NULL,
  `personalEmail` varchar(255) DEFAULT NULL,
  `anniversaryDate` date DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_personal_profiles_code_key` (`employeeCode`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `employee_profiles`;
CREATE TABLE IF NOT EXISTS `employee_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `userId` int(11) NOT NULL,
  `employeeCode` varchar(50) NOT NULL,
  `firstName` varchar(50) NOT NULL DEFAULT '',
  `lastName` varchar(50) NOT NULL DEFAULT '',
  `designationId` int(11) DEFAULT NULL,
  `departmentId` int(11) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  `reportingManagerId` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_employee_profiles_user` (`userId`),
  UNIQUE KEY `uq_employee_profiles_code` (`employeeCode`),
  KEY `idx_employee_profiles_user` (`userId`),
  KEY `idx_ep_reporting_manager` (`reportingManagerId`),
  CONSTRAINT `fk_employee_profiles_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ep_reporting_manager` FOREIGN KEY (`reportingManagerId`) REFERENCES `employees` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `employee_reimbursements`;
CREATE TABLE IF NOT EXISTS `employee_reimbursements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `componentCode` varchar(40) DEFAULT NULL,
  `claimDate` date NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `receiptPath` varchar(500) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'PENDING',
  `approvedBy` int(11) DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `payrollRecordId` int(11) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `employee_reimbursements_employee_status_idx` (`employeeId`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `employee_tax_declarations`;
CREATE TABLE IF NOT EXISTS `employee_tax_declarations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `financialYear` varchar(10) NOT NULL,
  `taxRegime` varchar(20) NOT NULL,
  `declarationJson` text DEFAULT NULL,
  `proofJson` text DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'DRAFT',
  `submittedAt` datetime(3) DEFAULT NULL,
  `verifiedBy` int(11) DEFAULT NULL,
  `verifiedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_tax_declarations_employee_fy_key` (`employeeId`,`financialYear`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `expense_claims`;
CREATE TABLE IF NOT EXISTS `expense_claims` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `expenseDate` date NOT NULL,
  `category` varchar(50) NOT NULL DEFAULT 'OTHER',
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `description` varchar(500) DEFAULT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `reviewedBy` int(11) DEFAULT NULL,
  `reviewedAt` datetime(3) DEFAULT NULL,
  `reviewComment` varchar(500) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `expense_claims_employeeId_status_idx` (`employeeId`,`status`),
  KEY `expense_claims_status_idx` (`status`),
  CONSTRAINT `expense_claims_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `holidays`;
CREATE TABLE IF NOT EXISTS `holidays` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `date` date NOT NULL,
  `isRecurring` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `holidays_date_idx` (`date`),
  KEY `holidays_name_idx` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `import_batches`;
CREATE TABLE IF NOT EXISTS `import_batches` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fileName` varchar(255) NOT NULL,
  `uploadedBy` int(11) NOT NULL,
  `totalRows` int(11) NOT NULL DEFAULT 0,
  `savedRows` int(11) NOT NULL DEFAULT 0,
  `duplicateRows` int(11) NOT NULL DEFAULT 0,
  `failedRows` int(11) NOT NULL DEFAULT 0,
  `unknownIds` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`unknownIds`)),
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `import_batches_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `invitation_tokens`;
CREATE TABLE IF NOT EXISTS `invitation_tokens` (
  `id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'EMPLOYEE',
  `tokenHash` varchar(255) NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `usedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_invitation_tokens_email` (`email`),
  KEY `idx_invitation_tokens_used` (`used`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `leaves`;
CREATE TABLE IF NOT EXISTS `leaves` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `type` enum('CASUAL','SICK','EARNED','MATERNITY','PATERNITY','UNPAID') NOT NULL DEFAULT 'CASUAL',
  `status` enum('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `approverId` int(11) DEFAULT NULL,
  `approverNote` varchar(255) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `leaves_employeeId_idx` (`employeeId`),
  KEY `leaves_status_idx` (`status`),
  KEY `leaves_startDate_idx` (`startDate`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `leave_balances`;
CREATE TABLE IF NOT EXISTS `leave_balances` (
  `id` varchar(191) NOT NULL,
  `employeeId` int(11) NOT NULL,
  `leaveTypeId` varchar(191) NOT NULL,
  `openingBalance` decimal(6,2) NOT NULL DEFAULT 0.00,
  `accruedBalance` decimal(6,2) NOT NULL DEFAULT 0.00,
  `usedBalance` decimal(6,2) NOT NULL DEFAULT 0.00,
  `reservedBalance` decimal(6,2) NOT NULL DEFAULT 0.00,
  `availableBalance` decimal(6,2) NOT NULL DEFAULT 0.00,
  `year` int(11) NOT NULL,
  `lastAccruedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `leave_balances_emp_type_year_key` (`employeeId`,`leaveTypeId`,`year`),
  KEY `leave_balances_emp_type_idx` (`employeeId`,`leaveTypeId`),
  CONSTRAINT `lb_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `leave_policies`;
CREATE TABLE IF NOT EXISTS `leave_policies` (
  `id` varchar(191) NOT NULL,
  `leaveTypeId` varchar(191) NOT NULL,
  `maxDaysPerYear` decimal(5,2) NOT NULL DEFAULT 0.00,
  `maxDaysPerMonth` decimal(5,2) NOT NULL DEFAULT 0.00,
  `maxConsecutive` decimal(5,2) NOT NULL DEFAULT 0.00,
  `requiresApproval` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `leave_policies_type_idx` (`leaveTypeId`),
  CONSTRAINT `lp_typeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leave_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `leave_types`;
CREATE TABLE IF NOT EXISTS `leave_types` (
  `id` varchar(191) NOT NULL,
  `name` varchar(50) NOT NULL,
  `displayName` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `code` varchar(20) NOT NULL,
  `classification` varchar(10) NOT NULL DEFAULT 'PAID',
  `isHalfDayAllowed` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  `annualEntitlementDays` decimal(6,2) NOT NULL DEFAULT 0.00,
  `isUnlimited` tinyint(1) NOT NULL DEFAULT 0,
  `appliesToBoardLevel` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `leave_types_name_key` (`name`),
  UNIQUE KEY `leave_types_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `notifications`;
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` varchar(191) NOT NULL,
  `userId` int(11) NOT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'INFO',
  `title` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `isRead` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `notifications_userId_idx` (`userId`),
  KEY `notifications_userId_isRead_idx` (`userId`,`isRead`),
  CONSTRAINT `nf_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `password_reset_tokens`;
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` varchar(191) NOT NULL,
  `userId` int(11) NOT NULL,
  `tokenHash` varchar(255) NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `usedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `password_reset_tokens_userId_idx` (`userId`),
  KEY `password_reset_tokens_tokenHash_idx` (`tokenHash`),
  CONSTRAINT `password_reset_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `payout_details`;
CREATE TABLE IF NOT EXISTS `payout_details` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeCode` varchar(50) NOT NULL,
  `earnings` text NOT NULL,
  `deductions` text NOT NULL,
  `bankName` varchar(100) DEFAULT NULL,
  `accountNumber` varchar(30) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `createdBy` varchar(191) DEFAULT NULL,
  `updatedBy` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payout_details_code_key` (`employeeCode`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `payout_history`;
CREATE TABLE IF NOT EXISTS `payout_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeCode` varchar(50) NOT NULL,
  `version` int(11) NOT NULL,
  `action` varchar(20) NOT NULL,
  `beforeData` text DEFAULT NULL,
  `afterData` text NOT NULL,
  `actorId` varchar(191) DEFAULT NULL,
  `actorRole` varchar(191) NOT NULL,
  `confirmedCode` varchar(50) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `payout_history_code_idx` (`employeeCode`,`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `payroll_approvals`;
CREATE TABLE IF NOT EXISTS `payroll_approvals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payrollRecordId` int(11) NOT NULL,
  `action` varchar(30) NOT NULL,
  `comment` varchar(1000) DEFAULT NULL,
  `actedBy` int(11) NOT NULL,
  `actedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `payroll_approvals_record_acted_idx` (`payrollRecordId`,`actedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `payroll_audit_logs`;
CREATE TABLE IF NOT EXISTS `payroll_audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payrollRecordId` int(11) DEFAULT NULL,
  `payrollPeriodId` int(11) DEFAULT NULL,
  `actorId` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `reason` varchar(1000) DEFAULT NULL,
  `beforeValue` text DEFAULT NULL,
  `afterValue` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `payroll_audit_logs_record_created_idx` (`payrollRecordId`,`createdAt`),
  KEY `payroll_audit_logs_period_created_idx` (`payrollPeriodId`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `payroll_components`;
CREATE TABLE IF NOT EXISTS `payroll_components` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payrollRecordId` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'EARNING',
  `amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `sortOrder` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_payroll_components_record` (`payrollRecordId`,`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `payroll_input_snapshots`;
CREATE TABLE IF NOT EXISTS `payroll_input_snapshots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payrollRecordId` int(11) NOT NULL,
  `totalCalendarDays` int(11) NOT NULL,
  `workingDays` decimal(6,2) NOT NULL DEFAULT 0.00,
  `presentDays` decimal(6,2) NOT NULL DEFAULT 0.00,
  `paidLeaveDays` decimal(6,2) NOT NULL DEFAULT 0.00,
  `unpaidLeaveDays` decimal(6,2) NOT NULL DEFAULT 0.00,
  `lopDays` decimal(6,2) NOT NULL DEFAULT 0.00,
  `halfDays` decimal(6,2) NOT NULL DEFAULT 0.00,
  `prorationBasis` varchar(30) NOT NULL DEFAULT 'WORKING_DAYS',
  `prorationFactor` decimal(10,6) NOT NULL DEFAULT 1.000000,
  `warningsJson` text DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_input_snapshots_payrollRecordId_key` (`payrollRecordId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `payroll_periods`;
CREATE TABLE IF NOT EXISTS `payroll_periods` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `month` int(11) NOT NULL,
  `year` int(11) NOT NULL,
  `payrollGroup` varchar(100) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'DRAFT',
  `lockedAt` datetime(3) DEFAULT NULL,
  `lockedBy` int(11) DEFAULT NULL,
  `paidAt` datetime(3) DEFAULT NULL,
  `createdBy` int(11) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payroll_periods_month_year_payrollGroup_key` (`month`,`year`,`payrollGroup`),
  KEY `payroll_periods_year_month_status_idx` (`year`,`month`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `payroll_records`;
CREATE TABLE IF NOT EXISTS `payroll_records` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `salaryStructureId` int(11) NOT NULL,
  `month` int(11) NOT NULL,
  `year` int(11) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `grossEarnings` decimal(14,2) NOT NULL DEFAULT 0.00,
  `totalDeductions` decimal(14,2) NOT NULL DEFAULT 0.00,
  `netPay` decimal(14,2) NOT NULL DEFAULT 0.00,
  `preparedBy` int(11) DEFAULT NULL,
  `preparedAt` datetime(3) DEFAULT NULL,
  `submittedAt` datetime(3) DEFAULT NULL,
  `approvedBy` int(11) DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `rejectionReason` varchar(255) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_payroll_records_employee_period` (`employeeId`,`year`,`month`),
  KEY `idx_payroll_records_period` (`year`,`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `payroll_statutory_settings`;
CREATE TABLE IF NOT EXISTS `payroll_statutory_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `statutoryType` varchar(30) NOT NULL,
  `stateCode` varchar(10) DEFAULT NULL,
  `employeeRate` decimal(7,4) NOT NULL DEFAULT 0.0000,
  `employerRate` decimal(7,4) NOT NULL DEFAULT 0.0000,
  `wageBasis` varchar(30) NOT NULL DEFAULT 'GROSS',
  `wageCeiling` decimal(14,2) DEFAULT NULL,
  `eligibilityJson` text DEFAULT NULL,
  `configurationJson` text DEFAULT NULL,
  `effectiveFrom` date NOT NULL,
  `effectiveTo` date DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdBy` int(11) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `payroll_statutory_settings_type_state_active_idx` (`statutoryType`,`stateCode`,`isActive`),
  KEY `payroll_statutory_settings_effective_idx` (`effectiveFrom`,`effectiveTo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `payslips`;
CREATE TABLE IF NOT EXISTS `payslips` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payrollRecordId` int(11) NOT NULL,
  `employeeId` int(11) NOT NULL,
  `month` int(11) NOT NULL,
  `year` int(11) NOT NULL,
  `pdfPath` varchar(255) DEFAULT NULL,
  `generatedBy` int(11) NOT NULL,
  `generatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payslips_record` (`payrollRecordId`),
  KEY `idx_payslips_employee_period` (`employeeId`,`year`,`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `refresh_tokens`;
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` varchar(191) NOT NULL,
  `userId` int(11) NOT NULL,
  `tokenHash` varchar(255) NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `revokedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `refresh_tokens_userId_idx` (`userId`),
  KEY `refresh_tokens_tokenHash_idx` (`tokenHash`),
  CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `role_access`;
CREATE TABLE IF NOT EXISTS `role_access` (
  `roleKey` varchar(30) NOT NULL,
  `canView` tinyint(1) NOT NULL DEFAULT 1,
  `canEdit` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`roleKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `salary_payheads`;
CREATE TABLE IF NOT EXISTS `salary_payheads` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(40) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` varchar(30) NOT NULL DEFAULT 'EARNING',
  `description` varchar(255) DEFAULT NULL,
  `isFixedByDefault` tinyint(1) NOT NULL DEFAULT 0,
  `calculationMethod` varchar(30) NOT NULL DEFAULT 'FIXED',
  `calculationBasis` varchar(30) DEFAULT NULL,
  `taxability` varchar(30) NOT NULL DEFAULT 'FULLY_TAXABLE',
  `pfApplicable` tinyint(1) NOT NULL DEFAULT 0,
  `esiApplicable` tinyint(1) NOT NULL DEFAULT 0,
  `includeInGross` tinyint(1) NOT NULL DEFAULT 1,
  `includeInCTC` tinyint(1) NOT NULL DEFAULT 1,
  `recurring` tinyint(1) NOT NULL DEFAULT 1,
  `prorateAttendance` tinyint(1) NOT NULL DEFAULT 0,
  `displayOnPayslip` tinyint(1) NOT NULL DEFAULT 1,
  `minimumAmount` decimal(14,2) DEFAULT NULL,
  `maximumAmount` decimal(14,2) DEFAULT NULL,
  `effectiveFrom` date NOT NULL DEFAULT curdate(),
  `effectiveTo` date DEFAULT NULL,
  `sortOrder` int(11) NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `salary_payheads_code_key` (`code`),
  KEY `salary_payheads_type_isActive_idx` (`type`,`isActive`),
  KEY `salary_payheads_effectiveFrom_effectiveTo_idx` (`effectiveFrom`,`effectiveTo`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `salary_rules`;
CREATE TABLE IF NOT EXISTS `salary_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `basicPct` decimal(5,2) NOT NULL DEFAULT 50.00,
  `hraPctOfBasic` decimal(5,2) NOT NULL DEFAULT 30.00,
  `pfPct` decimal(5,2) NOT NULL DEFAULT 12.00,
  `pfCap` decimal(14,2) NOT NULL DEFAULT 15000.00,
  `esicEmployerPct` decimal(5,2) NOT NULL DEFAULT 3.25,
  `esicEmployeePct` decimal(5,2) NOT NULL DEFAULT 0.75,
  `esicWageCeiling` decimal(14,2) NOT NULL DEFAULT 21000.00,
  `professionTax` decimal(14,2) NOT NULL DEFAULT 0.00,
  `workingDaysMonth` int(11) NOT NULL DEFAULT 30,
  `effectiveFrom` date NOT NULL DEFAULT curdate(),
  `effectiveTo` date DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  `createdBy` int(11) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `salary_rules_isActive_effectiveFrom_effectiveTo_idx` (`isActive`,`effectiveFrom`,`effectiveTo`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `salary_slips`;
CREATE TABLE IF NOT EXISTS `salary_slips` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `month` int(11) NOT NULL,
  `year` int(11) NOT NULL,
  `workingDays` int(11) NOT NULL,
  `presentDays` int(11) NOT NULL,
  `absentDays` int(11) NOT NULL,
  `basic` decimal(12,2) NOT NULL,
  `allowances` decimal(12,2) NOT NULL DEFAULT 0.00,
  `deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `netPay` decimal(12,2) NOT NULL,
  `generatedBy` int(11) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `salary_slips_employeeId_month_year_key` (`employeeId`,`month`,`year`),
  KEY `salary_slips_employeeId_year_month_idx` (`employeeId`,`year`,`month`),
  KEY `salary_slips_year_month_idx` (`year`,`month`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `salary_structures`;
CREATE TABLE IF NOT EXISTS `salary_structures` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `monthlyCTC` decimal(12,2) NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'INR',
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `effectiveFrom` datetime(3) NOT NULL,
  `effectiveTo` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_salary_structures_employee` (`employeeId`),
  KEY `idx_salary_structures_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `salary_structure_components`;
CREATE TABLE IF NOT EXISTS `salary_structure_components` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `salaryStructureId` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'EARNING',
  `calculationType` varchar(30) NOT NULL DEFAULT 'FIXED',
  `amount` decimal(14,2) DEFAULT NULL,
  `percentage` decimal(5,2) DEFAULT NULL,
  `formula` varchar(255) DEFAULT NULL,
  `sortOrder` int(11) NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_salary_structure_components` (`salaryStructureId`,`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `users`;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `email` varchar(255) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `role` enum('SUPER_ADMIN','HR_ADMIN','EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`),
  KEY `users_email_idx` (`email`),
  KEY `users_role_idx` (`role`)
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

DROP TABLE IF EXISTS `user_avatars`;
CREATE TABLE IF NOT EXISTS `user_avatars` (
  `userId` int(11) NOT NULL,
  `mimeType` varchar(10) NOT NULL DEFAULT 'image/jpeg',
  `data` longblob NOT NULL,
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `wfh_requests`;
CREATE TABLE IF NOT EXISTS `wfh_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `requestDate` datetime(3) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `reviewedBy` int(11) DEFAULT NULL,
  `reviewedAt` datetime(3) DEFAULT NULL,
  `reviewComment` varchar(255) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_wfh_requests_employee` (`employeeId`),
  KEY `idx_wfh_requests_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci

DROP TABLE IF EXISTS `_prisma_migrations`;
CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
  `id` varchar(36) NOT NULL,
  `checksum` varchar(64) NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) NOT NULL,
  `logs` text DEFAULT NULL,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `applied_steps_count` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

