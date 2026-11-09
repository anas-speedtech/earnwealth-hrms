-- Production table parity: creates the 5 raw-SQL tables Prisma does not model,
-- then seeds config/master data (leave_types, leave_policies, designations).
-- Safe to run on prod after deploying the code. Idempotent (IF NOT EXISTS / INSERT IGNORE).
--
-- NOT included (and why):
 --  user_avatars, payout_details, payout_history, employee_personal_profiles, role_access
 --    => self-create via CREATE TABLE IF NOT EXISTS inside their services on first use.
 --  notifications, attendance_imports, expense_claims
 --    => zero references in current source; skip.
 --  leave_balances
 --    => DDL only; seed per-employee DATA with: node scripts/seed-standard-leave-balances.cjs

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `designations` (
  `id` varchar(191) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `designations_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- config/master data (leave_policies FKs to leave_types.id, so the UAT UUIDs must be copied):

INSERT IGNORE INTO leave_types (`id`, `name`, `displayName`, `description`, `code`, `classification`, `isHalfDayAllowed`, `isActive`, `createdAt`, `updatedAt`, `annualEntitlementDays`, `isUnlimited`, `appliesToBoardLevel`) VALUES ('345dc388-46fb-4b3d-aa7f-f411dcfc673f', 'UNPAID', 'Unpaid Leave', NULL, 'UL', 'UNPAID', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000', '0', 0, 0);

INSERT IGNORE INTO leave_types (`id`, `name`, `displayName`, `description`, `code`, `classification`, `isHalfDayAllowed`, `isActive`, `createdAt`, `updatedAt`, `annualEntitlementDays`, `isUnlimited`, `appliesToBoardLevel`) VALUES ('4f287d19-1ac7-4934-aea3-49cb503347b7', 'EARNED', 'Earned Leave', NULL, 'EL', 'PAID', 1, 1, '2026-10-15 00:00:00.000', '2026-10-23 00:00:00.000', '12', 0, 1);

INSERT IGNORE INTO leave_types (`id`, `name`, `displayName`, `description`, `code`, `classification`, `isHalfDayAllowed`, `isActive`, `createdAt`, `updatedAt`, `annualEntitlementDays`, `isUnlimited`, `appliesToBoardLevel`) VALUES ('89451d22-ec7b-43aa-9d2e-4448e95d1acd', 'PRIVILEGE', 'Privilege Leave', 'Privilege leave (earned/privileged time off). Configuration-only addition; balances initialize at zero and accrue per policy.', 'PL', 'PAID', 1, 1, '2026-10-18 00:00:00.000', '2026-10-18 00:00:00.000', '2', 0, 0);

INSERT IGNORE INTO leave_types (`id`, `name`, `displayName`, `description`, `code`, `classification`, `isHalfDayAllowed`, `isActive`, `createdAt`, `updatedAt`, `annualEntitlementDays`, `isUnlimited`, `appliesToBoardLevel`) VALUES ('8d40f7ef-14a7-4bc5-ad82-c3ca5c84a868', 'PATERNITY', 'Paternity', NULL, 'PAT', 'PAID', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000', '0', 0, 0);

INSERT IGNORE INTO leave_types (`id`, `name`, `displayName`, `description`, `code`, `classification`, `isHalfDayAllowed`, `isActive`, `createdAt`, `updatedAt`, `annualEntitlementDays`, `isUnlimited`, `appliesToBoardLevel`) VALUES ('8e82e67e-780e-4530-a2df-4b7f241fe00b', 'CASUAL', 'Casual Leave', NULL, 'CL', 'PAID', 1, 1, '2026-10-15 00:00:00.000', '2026-10-23 00:00:00.000', '0', 1, 0);

INSERT IGNORE INTO leave_types (`id`, `name`, `displayName`, `description`, `code`, `classification`, `isHalfDayAllowed`, `isActive`, `createdAt`, `updatedAt`, `annualEntitlementDays`, `isUnlimited`, `appliesToBoardLevel`) VALUES ('bdbe153c-2dd6-4f7b-8b5f-ee50fc142443', 'MATERNITY', 'Maternity', NULL, 'MAT', 'PAID', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000', '0', 0, 0);

INSERT IGNORE INTO leave_types (`id`, `name`, `displayName`, `description`, `code`, `classification`, `isHalfDayAllowed`, `isActive`, `createdAt`, `updatedAt`, `annualEntitlementDays`, `isUnlimited`, `appliesToBoardLevel`) VALUES ('ca70384d-f0b2-4707-aa23-7861fd080de9', 'SICK', 'Sick Leave', NULL, 'SL', 'PAID', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000', '8', 0, 0);

INSERT IGNORE INTO leave_policies (`id`, `leaveTypeId`, `maxDaysPerYear`, `maxDaysPerMonth`, `maxConsecutive`, `requiresApproval`, `isActive`, `createdAt`, `updatedAt`) VALUES ('015fb339-e220-410c-b643-fcedb9cf8ff5', 'ca70384d-f0b2-4707-aa23-7861fd080de9', '10', '1', '5', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO leave_policies (`id`, `leaveTypeId`, `maxDaysPerYear`, `maxDaysPerMonth`, `maxConsecutive`, `requiresApproval`, `isActive`, `createdAt`, `updatedAt`) VALUES ('1dcd6be1-6f09-4862-bc91-6b4cd186dbe2', '8e82e67e-780e-4530-a2df-4b7f241fe00b', '12', '1.5', '3', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO leave_policies (`id`, `leaveTypeId`, `maxDaysPerYear`, `maxDaysPerMonth`, `maxConsecutive`, `requiresApproval`, `isActive`, `createdAt`, `updatedAt`) VALUES ('571b5b8d-4abb-46ba-9d06-10a586e8ab1a', 'bdbe153c-2dd6-4f7b-8b5f-ee50fc142443', '180', '0', '180', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO leave_policies (`id`, `leaveTypeId`, `maxDaysPerYear`, `maxDaysPerMonth`, `maxConsecutive`, `requiresApproval`, `isActive`, `createdAt`, `updatedAt`) VALUES ('9e0cc00d-2b35-49c9-b348-0eb7d113b793', '4f287d19-1ac7-4934-aea3-49cb503347b7', '18', '1.5', '10', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO leave_policies (`id`, `leaveTypeId`, `maxDaysPerYear`, `maxDaysPerMonth`, `maxConsecutive`, `requiresApproval`, `isActive`, `createdAt`, `updatedAt`) VALUES ('bbc62bb2-8e64-4bf1-b5e8-96a927f99998', '89451d22-ec7b-43aa-9d2e-4448e95d1acd', '12', '1', '5', 1, 1, '2026-10-18 00:00:00.000', '2026-10-18 00:00:00.000');

INSERT IGNORE INTO leave_policies (`id`, `leaveTypeId`, `maxDaysPerYear`, `maxDaysPerMonth`, `maxConsecutive`, `requiresApproval`, `isActive`, `createdAt`, `updatedAt`) VALUES ('d357d7aa-a602-4225-893c-7d106edb6bb1', '8d40f7ef-14a7-4bc5-ad82-c3ca5c84a868', '10', '0', '10', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO leave_policies (`id`, `leaveTypeId`, `maxDaysPerYear`, `maxDaysPerMonth`, `maxConsecutive`, `requiresApproval`, `isActive`, `createdAt`, `updatedAt`) VALUES ('e71ac584-fa90-44fb-8f15-54c4e12ee473', '345dc388-46fb-4b3d-aa7f-f411dcfc673f', '30', '5', '30', 1, 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('175fc42d-932c-4190-9827-d4aa450ab37f', 'Grade XIV - Director', 'Director Grade', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('209aa09b-e080-451f-a0a7-ac3782d16f6e', 'System Administrator', 'IT infrastructure and systems', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('23f5bf3a-2ab0-4e9e-8f45-b06bb4473f97', 'Grade XII - Director', 'Director Grade', 1, '2026-10-19 00:00:00.000', '2026-10-19 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('32f9f06b-b14c-4bd8-b3a9-df259469f0a3', 'Senior Software Engineer', 'Senior individual contributor — software', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('331d6a89-50da-48a9-b5d2-45d47103f0e8', 'Grade VI - Senior Manager', 'Managerial Grades', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('3c1670c3-c5ec-4183-b91f-6af5324bdd95', 'Sales Executive', 'Sales and business development', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('6c2e5632-2e18-4aba-8f36-8bc7fad239cd', 'Support Engineer', 'Customer support technical staff', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('704e3658-c653-4eaa-b153-71a303d39b4e', 'Grade XIII - Director', 'Director Grade', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('8a7ab40b-8936-4b1c-99cf-f00895fbb007', 'Software Engineer', 'Individual contributor — software', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('975d72d0-24cd-489a-9d0d-b8506239e1a6', 'Grade VII - Assistant Vice President', 'Presidential Grades', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('b53e0092-24ee-4520-ae92-1d703dcd8a0b', 'Grade XV - COO / Co-Founder', 'Co Founder', 1, '2026-10-19 00:00:00.000', '2026-10-19 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('f102c823-dd4d-4789-9565-a909eb74488e', 'Grade XI - President', 'Presidential Grades', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('f3e1b68f-9753-4f29-bfdc-9fb00266932f', 'VP of Engineering', 'Vice President — Engineering', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('fa02660f-b74d-4da6-b702-a09be159154f', 'Grade XV - CEO / Founder', 'Chief Executive Officer and company founder', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('fc138fea-a606-45d7-bb4f-b25a43329936', 'Grade VIII - Vice President', 'Presidential Grades', 1, '2026-10-19 00:00:00.000', '2026-10-19 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('fd96387e-97d0-44fa-a413-5b2685329db0', 'Grade X - Executive Vice President', 'Presidential Grades', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');

INSERT IGNORE INTO designations (`id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`) VALUES ('fecef786-3bc7-4c89-9f58-23b18f72311f', 'Grade IX - Senior Vice President', 'Presidential Grades', 1, '2026-10-15 00:00:00.000', '2026-10-15 00:00:00.000');
