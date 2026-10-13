# EWS HRMS — Database Schema Documentation

## Database
- **Name:** `ews-hrms`
- **Host:** `107.174.95.226:3306`
- **Engine:** MySQL 8
- **ORM:** Prisma 7.10.0

> Note: The database name is `ews-hrms`. The previous reference to `digital_store` was a configuration error and is not used.

---

## Models Overview

### Authentication (5 models)

| Model | Purpose |
|---|---|
| `User` | Central auth table — email, passwordHash, role, status |
| `SuperAdminProfile` | Super Admin personal info (1:1 with User) |
| `AdminProfile` | Admin personal info + department scope (1:1 with User) |
| `HrProfile` | HR personal info + department scope (1:1 with User) |
| `EmployeeProfile` | Employee personal/job info, reporting hierarchy (1:1 with User) |

### Session & Token Management (3 models)

| Model | Purpose |
|---|---|
| `RefreshToken` | JWT refresh tokens (server-side revocation support) |
| `PasswordResetToken` | Password reset tokens (hashed, expirable) |
| `InvitationToken` | New account invitation tokens (hashed, role-bound) |

### Organization (3 models)

| Model | Purpose |
|---|---|
| `Company` | Single-tenant company settings (timezone, currency, fiscal year) |
| `Department` | Departments with hierarchy support (self-referential) |
| `Designation` | Job titles with levels, linked to departments |

### Policies (3 models)

| Model | Purpose |
|---|---|
| `AttendancePolicy` | Work hours, grace period, WFH limits, weekly offs |
| `LeavePolicy` | Per-type leave quotas, accrual, carry-forward, sandwich rules |
| `CompOffPolicy` | Expiry period, max accumulation, approval requirements |

### Attendance (2 models)

| Model | Purpose |
|---|---|
| `Attendance` | Daily punch in/out records (OFFICE or WFH mode) |
| `AttendanceCorrection` | Correction requests with HR approval workflow |

### WFH (1 model)

| Model | Purpose |
|---|---|
| `WfhApplication` | Pre-approved WFH date requests |

### Leave (3 models)

| Model | Purpose |
|---|---|
| `LeaveBalance` | Per-employee, per-type balance (CL, PL, etc.) |
| `LeaveBalanceTransaction` | Ledger of balance changes (credit, usage, carry-forward) |
| `LeaveApplication` | Leave requests with approval workflow |

### Comp-Off (3 models)

| Model | Purpose |
|---|---|
| `CompOffBalance` | Per-employee comp-off balance |
| `CompOffCredit` | Individual credit entries with expiry (ledger-style) |
| `CompOffApplication` | Comp-off usage requests |

### Payroll (4 models)

| Model | Purpose |
|---|---|
| `SalaryStructure` | Per-employee earnings/deductions configuration |
| `PayrollRun` | Monthly payroll batch (DRAFT → SUBMITTED → APPROVED) |
| `PayrollRecord` | Per-employee payroll snapshot per run |
| `Payslip` | Generated payslip with PDF path |

### Notifications & Audit (2 models)

| Model | Purpose |
|---|---|
| `Notification` | In-app notifications per user |
| `AuditLog` | Immutable audit trail for sensitive operations |

---

## Key Relationships

```
Company 1───1 AttendancePolicy
Company 1───* LeavePolicy
Company 1───1 CompOffPolicy
Company 1───* Holiday

User 1───1 SuperAdminProfile | AdminProfile | HrProfile | EmployeeProfile
EmployeeProfile *───* Department (via departmentId)
EmployeeProfile *───* Designation (via designationId)
EmployeeProfile 1───1 EmployeeProfile (reporting hierarchy)

EmployeeProfile 1───* Attendance (unique per day)
EmployeeProfile 1───* AttendanceCorrection
EmployeeProfile 1───* WfhApplication
EmployeeProfile 1───* LeaveApplication
EmployeeProfile 1───1 LeaveBalance (per leave type per year)
LeaveBalance 1───* LeaveBalanceTransaction
EmployeeProfile 1───1 CompOffBalance
CompOffBalance 1───* CompOffCredit
CompOffCredit 1───* CompOffApplication
EmployeeProfile 1───1 SalaryStructure (active)
PayrollRun 1───* PayrollRecord
PayrollRecord 1───1 Payslip
User 1───* Notification
User 1───* AuditLog (as actor)
```

---

## Security & Data Integrity

- All passwords stored as bcrypt hashes (cost 12)
- All tokens (reset, invitation, refresh) stored as hashes, never plaintext
- Foreign keys use `onDelete: Cascade` for owned data, `SetNull` for references
- Unique constraints prevent duplicates (one attendance per employee per day, etc.)
- Decimal types used for all monetary amounts (no floating-point)
- UUID primary keys throughout
- Indexes on frequently queried fields (email, employeeId + date, status)
