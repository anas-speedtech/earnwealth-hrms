const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { EmployeeService } = require('../services/employee.service');
const { PayoutService } = require('../services/payout.service');
const { PersonalProfileService } = require('../services/personal-profile.service');
const { Role } = require('../types/index');

const router = express.Router();

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  search: z.string().default(''),
  departmentId: z.string().default(''),
  designationId: z.string().default(''),
  status: z.string().default(''),
});

const createSchema = z.object({
  email: z.string().email().optional(),
  // Optional login credentials: when a password (and email) are supplied the
  // employee record gets a linked user account so the person can log in.
  password: z.string().min(8).max(128).optional(),
  employeeCode: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  designation: z.string().min(1),
  // Job grade / band. Optional free text; captured on the record and shown
  // in the employee table.
  grade: z.string().trim().max(50).optional().nullable(),
  // Legacy biometric-device slot. Optional: the employee code is the
  // identifier everywhere else, so an account may be created without one.
  deviceEnrollNo: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().positive().nullable(),
  ).optional(),
  basicSalary: z.coerce.number().min(0),
  allowances: z.coerce.number().min(0).default(0),
  deductions: z.coerce.number().min(0).default(0),
  departmentId: z.coerce.string().optional().default(''),
  joiningDate: z.string(),
  status: z.string().default('ACTIVE').transform((value) => value.toUpperCase()),
  role: z.enum(['EMPLOYEE']).optional(),
  departmentText: z.string().optional(),
  // Leave types this employee is entitled to (IDs from the leave-types list).
  // When omitted the employee starts with no configured leave balances.
  leaveTypes: z.array(z.string()).optional().default([]),
  // Optional: top-level / founder employees have nobody above them, so the
  // manager may be left off. When supplied it must be a valid employee id.
  reportingManagerId: z.preprocess(
    (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : v),
    z.coerce.number().int().positive().nullable(),
  ).optional(),
  // Leave types this employee is configured for (leave-type ids or names).
  // Seeds a leave_balances row per type so the employee immediately sees
  // (and can apply) only their types. Mirrors the /admin-users flow.
  leaveTypes: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  employeeCode: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  designation: z.string().min(1).optional(),
  grade: z.string().trim().max(50).optional().nullable(),
  // Contractually required to work Saturdays: Saturday stops being a weekly
  // off for this employee (no punch = LWP) and Saturday work earns no
  // comp-off credit.
  worksSaturday: z.boolean().optional().nullable(),
  departmentId: z.coerce.string().optional(),
  joiningDate: z.string().optional(),
  basicSalary: z.coerce.number().min(0).optional(),
  allowances: z.coerce.number().min(0).optional(),
  deductions: z.coerce.number().min(0).optional(),
  status: z.string().optional(),
  // reportingManagerId is optional only when the creator is a SUPER_ADMIN
  // setting up the first employee. For HR Admin and Employee role creators,
  // it is still mandatory and rejected at the service level.
  reportingManagerId: z.coerce.number().int().positive().optional(),
  // Replace the employee's leave-type set on every update.
  leaveTypes: z.array(z.string()).optional().default([]),
});

// ---- Personal profile (address, DOB, emergency contact, ...) ----
//
// Employees no longer self-edit these (the /me PUT is HR-gated), so HR
// maintains them on the employee-detail page. DOB lives here too — the
// legacy `employees` table has no date-of-birth column.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const optionalDay = z.union([z.literal(''), z.string().regex(DAY_RE)]).optional().nullable();
const personalProfileSchema = z.object({
  address: z.string().max(500).optional().nullable(),
  dateOfBirth: optionalDay,
  emergencyContact: z.string().max(100).optional().nullable(),
  personalEmail: z.union([z.literal(''), z.string().email().max(255)]).optional().nullable(),
  anniversaryDate: optionalDay,
});

// ---- Payout Details (earnings/deduction structure + bank, change-tracked) ----

const payoutLineSchema = z.object({
  label: z.string().trim().min(1).max(100),
  amount: z.coerce.number().min(0).max(999999999),
});

const payoutUpdateSchema = z.object({
  earnings: z.array(payoutLineSchema).min(1, 'At least one earnings line is required.').max(50),
  deductions: z.array(payoutLineSchema).max(50).default([]),
  bankName: z.string().trim().max(100).optional().nullable(),
  accountNumber: z.string().trim().max(30).optional().nullable(),
  // The HR confirmation gate: must equal the employee's code, else the
  // service refuses the write and no change is persisted.
  confirmedEmployeeCode: z.string().trim().min(1),
});

// All endpoints require authentication
// Specific role authorization enforced per endpoint
router.use(authenticate);

// List employees — SUPER_ADMIN, ADMIN, HR
router.get('/employees', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const query = {
      page: parseInt(req.query.page) || 1,
      search: req.query.search || '',
      departmentId: req.query.departmentId || '',
      designationId: req.query.designationId || '',
      status: req.query.status || '',
      // Column sort — the service whitelists these, so only known keys reach SQL.
      sortBy: req.query.sortBy || '',
      sortDir: req.query.sortDir || 'asc',
    };
    const result = await EmployeeService.list(req.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get single employee
router.get('/employees/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE), async (req, res, next) => {
  try {
    const result = await EmployeeService.getById(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Create employee — SUPER_ADMIN, ADMIN, HR
router.post('/employees', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(createSchema), async (req, res, next) => {
  try {
    const result = await EmployeeService.create(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Update employee — SUPER_ADMIN, ADMIN, HR
router.patch('/employees/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(updateSchema), async (req, res, next) => {
  try {
    const result = await EmployeeService.update(req.user, req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Deactivate employee — SUPER_ADMIN, ADMIN
router.post('/employees/:id/deactivate', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await EmployeeService.deactivate(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Activate employee — SUPER_ADMIN, ADMIN
router.post('/employees/:id/activate', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await EmployeeService.activate(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---- Payout Details endpoints (structure + change log) ----

// Current payout structure for the employee.
router.get(
  '/employees/:id/payout',
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayoutService.getForEmployee(req.user, req.params.id);
      res.json(result || null);
    } catch (err) {
      next(err);
    }
  }
);

// Create / update the structure. Requires the HR-confirmed employee code
// (confirmedEmployeeCode) and logs before/after into payout_history + audit.
router.put(
  '/employees/:id/payout',
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(payoutUpdateSchema),
  async (req, res, next) => {
    try {
      const result = await PayoutService.update(req.user, req.params.id, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Change history (most recent first).
router.get(
  '/employees/:id/payout/history',
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayoutService.history(req.user, req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Personal profile (HR-maintained; employees are view-only) ----

// Read one employee's personal profile (address, DOB, emergency contact,
// personal email, anniversary). Includes DOB so the detail page can show it.
router.get(
  '/employees/:id/personal-profile',
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const profile = await PersonalProfileService.getForEmployeeId(req.params.id);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

// Upsert one employee's personal profile. Because the employee's own /me PUT
// is now HR-gated, this is the surface where HR Admin / Super Admin write
// those fields (and DOB) for the employee.
router.put(
  '/employees/:id/personal-profile',
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(personalProfileSchema),
  async (req, res, next) => {
    try {
      const profile = await PersonalProfileService.upsertForEmployeeId(req.params.id, req.body);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
