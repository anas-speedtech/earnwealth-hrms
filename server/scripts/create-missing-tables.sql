-- Additive helper: creates the tables that were missing from the database.
-- Every statement is guarded with IF NOT EXISTS, so running this script more
-- than once is safe. It must only ever be used to ADD tables, never to alter
-- existing ones.

CREATE TABLE IF NOT EXISTS employee_profiles (
  id            INT NOT NULL AUTO_INCREMENT,
  userId        INT NOT NULL,
  employeeCode  VARCHAR(50) NOT NULL,
  firstName     VARCHAR(50) NOT NULL DEFAULT '',
  lastName      VARCHAR(50) NOT NULL DEFAULT '',
  designationId INT NULL,
  departmentId  INT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  createdAt     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_profiles_user (userId),
  UNIQUE KEY uq_employee_profiles_code (employeeCode),
  KEY idx_employee_profiles_user (userId),
  CONSTRAINT fk_employee_profiles_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wfh_requests (
  id           INT NOT NULL AUTO_INCREMENT,
  employeeId   INT NOT NULL,
  requestDate  DATETIME(3) NOT NULL,
  reason       VARCHAR(500) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reviewedBy  INT NULL,
  reviewedAt  DATETIME(3) NULL,
  reviewComment VARCHAR(255) NULL,
  createdAt    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_wfh_requests_employee (employeeId),
  KEY idx_wfh_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id                INT NOT NULL AUTO_INCREMENT,
  attendanceId      INT NOT NULL,
  employeeId        INT NOT NULL,
  originalPunchIn   DATETIME(3) NULL,
  originalPunchOut  DATETIME(3) NULL,
  originalStatus    VARCHAR(10) NOT NULL DEFAULT 'UNKNOWN',
  correctedPunchIn  DATETIME(3) NULL,
  correctedPunchOut DATETIME(3) NULL,
  correctedStatus   VARCHAR(10) NOT NULL DEFAULT 'UNKNOWN',
  reason            VARCHAR(500) NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reviewComment     VARCHAR(255) NULL,
  reviewedBy        INT NULL,
  reviewedAt        DATETIME(3) NULL,
  createdAt         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_attendance_corrections_attendance (attendanceId),
  KEY idx_attendance_corrections_employee (employeeId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_structure_components (
  id                INT NOT NULL AUTO_INCREMENT,
  salaryStructureId INT NOT NULL,
  name              VARCHAR(100) NOT NULL,
  description       VARCHAR(500) NULL,
  type              VARCHAR(20) NOT NULL DEFAULT 'EARNING',
  calculationType   VARCHAR(30) NOT NULL DEFAULT 'FIXED',
  amount            DECIMAL(14, 2) NULL,
  percentage        DECIMAL(5, 2) NULL,
  formula           VARCHAR(255) NULL,
  sortOrder         INT NOT NULL DEFAULT 0,
  isActive          BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  KEY idx_salary_structure_components (salaryStructureId, sortOrder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_structures (
  id            INT NOT NULL AUTO_INCREMENT,
  employeeId    INT NOT NULL,
  monthlyCTC    DECIMAL(12, 2) NOT NULL,
  currency      VARCHAR(3) NOT NULL DEFAULT 'INR',
  isActive      BOOLEAN NOT NULL DEFAULT TRUE,
  effectiveFrom DATETIME(3) NOT NULL,
  effectiveTo   DATETIME(3) NULL,
  createdAt     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_salary_structures_employee (employeeId),
  KEY idx_salary_structures_active (isActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_components (
  id               INT NOT NULL AUTO_INCREMENT,
  payrollRecordId  INT NOT NULL,
  name             VARCHAR(100) NOT NULL,
  type             VARCHAR(20) NOT NULL DEFAULT 'EARNING',
  amount           DECIMAL(12, 2) NOT NULL DEFAULT 0,
  sortOrder        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_payroll_components_record (payrollRecordId, sortOrder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_records (
  id                 INT NOT NULL AUTO_INCREMENT,
  employeeId         INT NOT NULL,
  salaryStructureId INT NOT NULL,
  month              INT NOT NULL,
  year               INT NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  grossEarnings      DECIMAL(14, 2) NOT NULL DEFAULT 0,
  totalDeductions    DECIMAL(14, 2) NOT NULL DEFAULT 0,
  netPay             DECIMAL(14, 2) NOT NULL DEFAULT 0,
  preparedBy        INT NULL,
  preparedAt        DATETIME(3) NULL,
  submittedAt       DATETIME(3) NULL,
  approvedBy        INT NULL,
  approvedAt        DATETIME(3) NULL,
  rejectionReason   VARCHAR(255) NULL,
  createdAt         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_payroll_records_employee_period (employeeId, year, month),
  KEY idx_payroll_records_period (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payslips (
  id              INT NOT NULL AUTO_INCREMENT,
  payrollRecordId INT NOT NULL,
  employeeId      INT NOT NULL,
  month           INT NOT NULL,
  year            INT NOT NULL,
  pdfPath         VARCHAR(255) NULL,
  generatedBy     INT NOT NULL,
  generatedAt     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payslips_record (payrollRecordId),
  KEY idx_payslips_employee_period (employeeId, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invitation_tokens (
  id         VARCHAR(36) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE',
  tokenHash   VARCHAR(255) NOT NULL,
  expiresAt   DATETIME(3) NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  usedAt      DATETIME(3) NULL,
  createdAt   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_invitation_tokens_email (email),
  KEY idx_invitation_tokens_used (used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
