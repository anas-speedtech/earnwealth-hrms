CREATE TABLE `attendance_day_locks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `employeeId` INT NOT NULL,
  `date` DATE NOT NULL,
  `isLocked` BOOLEAN NOT NULL DEFAULT true,
  `lockedBy` INT NOT NULL,
  `reason` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `attendance_day_locks_employeeId_date_key` (`employeeId`, `date`),
  INDEX `attendance_day_locks_date_isLocked_idx` (`date`, `isLocked`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
