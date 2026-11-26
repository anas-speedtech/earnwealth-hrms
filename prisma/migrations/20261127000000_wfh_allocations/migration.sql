-- Standing WFH allocation (Configuration → WFH Allocation):
-- an allocated employee is exempt from device attendance and self-punches
-- their day (today only — past/future days stay locked).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS `wfh_allocations` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `employeeId` INT(11) NOT NULL,
  `allocatedBy` INT(11) DEFAULT NULL,
  `allocatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `revokedAt` DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wfh_allocation_emp` (`employeeId`),
  KEY `wfh_allocations_employee_idx` (`employeeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
