SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `_prisma_migrations`;

CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) NOT NULL,
  `checksum` varchar(64) NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) NOT NULL,
  `logs` text DEFAULT NULL,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `applied_steps_count` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `attendance_logs`;

CREATE TABLE `attendance_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employeeId` int(11) NOT NULL,
  `punchTime` datetime NOT NULL,
  `status` enum('IN','OUT','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `departments`;

CREATE TABLE `departments` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `employees`;

CREATE TABLE `employees` (
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `employees_employeeCode_key` (`employeeCode`),
  UNIQUE KEY `employees_deviceEnrollNo_key` (`deviceEnrollNo`),
  UNIQUE KEY `employees_userId_key` (`userId`),
  KEY `employees_userId_idx` (`userId`),
  KEY `employees_deviceEnrollNo_idx` (`deviceEnrollNo`),
  KEY `employees_employeeCode_idx` (`employeeCode`),
  KEY `employees_departmentId_idx` (`departmentId`),
  CONSTRAINT `employees_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `employees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `holidays`;

CREATE TABLE `holidays` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `date` date NOT NULL,
  `isRecurring` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `holidays_date_idx` (`date`),
  KEY `holidays_name_idx` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `import_batches`;

CREATE TABLE `import_batches` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `leaves`;

CREATE TABLE `leaves` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `salary_slips`;

CREATE TABLE `salary_slips` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `email` varchar(255) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `role` enum('SUPER_ADMIN','ADMIN','HR_MANAGER','EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`),
  KEY `users_email_idx` (`email`),
  KEY `users_role_idx` (`role`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;