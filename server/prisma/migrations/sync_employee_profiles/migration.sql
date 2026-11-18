-- Migration: sync existing employees into employee_profiles
-- Required because EmployeeService.create() only writes to the legacy `employees`
-- table; payslip/payroll engines use `employee_profiles` via Prisma relations.
-- Run this once on each environment (local + production).

INSERT INTO employee_profiles
  (employeeCode, userId, firstName, lastName, departmentId, reportingManagerId, status, createdAt, updatedAt)
SELECT
  e.employeeCode,
  e.userId,
  SUBSTRING_INDEX(e.name, ' ', 1)                                              AS firstName,
  TRIM(SUBSTRING(e.name, LENGTH(SUBSTRING_INDEX(e.name, ' ', 1)) + 1))         AS lastName,
  e.departmentId,
  e.reportingManagerId,
  CASE WHEN e.isActive = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END                  AS status,
  NOW(3), NOW(3)
FROM employees e
ON DUPLICATE KEY UPDATE
  userId          = VALUES(userId),
  firstName       = VALUES(firstName),
  lastName        = VALUES(lastName),
  departmentId    = VALUES(departmentId),
  reportingManagerId = VALUES(reportingManagerId),
  status          = VALUES(status),
  updatedAt       = NOW(3);
