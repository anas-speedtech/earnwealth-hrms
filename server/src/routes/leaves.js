const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { LeaveService } = require('../services/leave.service');
const { Role } = require('../types/index');

const router = express.Router();

const createLeaveSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isHalfDay: z.boolean().optional().default(false),
  halfDayPeriod: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional().nullable(),
  reason: z.string().min(1).max(1000),
});

const updateLeaveTypeSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  classification: z.enum(['PAID', 'UNPAID']).optional(),
  isHalfDayAllowed: z.boolean().optional(),
  isActive: z.boolean().optional(),
  annualEntitlementDays: z.coerce.number().min(0).optional(),
  isUnlimited: z.boolean().optional(),
  appliesToBoardLevel: z.boolean().optional(),
});

const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  description: z.string().optional(),
  code: z.string().min(1).max(20),
  classification: z.enum(['PAID', 'UNPAID']).default('PAID'),
  isHalfDayAllowed: z.boolean().default(true),
  isActive: z.boolean().default(true),
  // Organisation-wide policy: annual entitlement, and the two exception
  // flags. `isUnlimited` means there is no cap; `appliesToBoardLevel` marks
  // types that exist only for board-level designations.
  annualEntitlementDays: z.coerce.number().min(0).default(0),
  isUnlimited: z.boolean().default(false),
  appliesToBoardLevel: z.boolean().default(false),
  effectiveFrom: z.string().min(1),
});

const reviewSchema = z.object({
  reviewComment: z.string().optional().default(''),
});

// ============ EMPLOYEE ENDPOINTS ============

// Get my leave balances
router.get('/leaves/balance', authenticate, async (req, res, next) => {
  try {
    const result = await LeaveService.getMyBalances(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get my leave requests
router.get('/leaves/my-requests', authenticate, validateQuery(z.object({
  page: z.coerce.number().int().positive().default(1),
  status: z.string().optional(),
})), async (req, res, next) => {
  try {
    const result = await LeaveService.getMyRequests(req.user, {
      page: parseInt(req.query.page) || 1,
      status: req.query.status,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Submit leave request
router.post('/leaves', authenticate, validateBody(createLeaveSchema), async (req, res, next) => {
  try {
    const result = await LeaveService.createRequest(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Cancel leave request
router.post('/leaves/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const result = await LeaveService.cancelRequest(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// List active leave types (for dropdown)
router.get('/leaves/types', authenticate, async (req, res, next) => {
  try {
    const types = await LeaveService.listLeaveTypes();
    res.json(types);
  } catch (err) {
    next(err);
  }
});

// ============ HR / ADMIN / SUPER_ADMIN ENDPOINTS ============

// Get pending leave requests
router.get('/leaves/pending', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const requests = await LeaveService.getPendingRequests(req.user);
    res.json(requests);
  } catch (err) {
    next(err);
  }
});

// Leave-type tiles for the HR broad view: per-type counts for a month (or a
// single day), plus the requests that back each tile for drill-down.
router.get('/leaves/tiles', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateQuery(z.object({
  year: z.coerce.number().int().positive().default(new Date().getFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(new Date().getMonth() + 1),
  day: z.coerce.number().int().min(0).max(31).default(0),
})), async (req, res, next) => {
  try {
    const result = await LeaveService.getTiles(req.user, {
      year: req.query.year,
      month: req.query.month,
      day: req.query.day,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get all leave requests (with filters)
router.get('/leaves/all', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateQuery(z.object({
  page: z.coerce.number().int().positive().default(1),
  status: z.string().optional(),
  employeeId: z.string().uuid().optional(),
})), async (req, res, next) => {
  try {
    const result = await LeaveService.getAllRequests(req.user, {
      page: parseInt(req.query.page) || 1,
      status: req.query.status,
      employeeId: req.query.employeeId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get leave request detail.
// Kept BELOW the literal /leaves/pending and /leaves/all routes so that
// ":id" does not swallow them — Express matches in registration order.
router.get('/leaves/:id', authenticate, async (req, res, next) => {
  try {
    const result = await LeaveService.getRequestDetail(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get employee leave balances (HR view)
router.get('/leaves/employee/:employeeId/balances', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await LeaveService.getEmployeeBalances(req.user, req.params.employeeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Approve leave request
router.post('/leaves/:id/approve', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const result = await LeaveService.approveRequest(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Reject leave request
router.post('/leaves/:id/reject', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(z.object({
  reviewComment: z.string().min(1, 'A rejection reason is required.'),
})), async (req, res, next) => {
  try {
    const result = await LeaveService.rejectRequest(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============ LEAVE TYPE MANAGEMENT ============

// List all leave types (admin)
router.get('/leave-types', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const types = await LeaveService.getAllLeaveTypes(req.user);
    res.json(types);
  } catch (err) {
    next(err);
  }
});

// Create leave type
router.post('/leave-types', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(createLeaveTypeSchema), async (req, res, next) => {
  try {
    const result = await LeaveService.createLeaveType(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Update leave type
router.put('/leave-types/:id', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(updateLeaveTypeSchema), async (req, res, next) => {
  try {
    const result = await LeaveService.updateLeaveType(req.user, req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============ BALANCE MANAGEMENT ============

// Initialise balances for a single employee (optional year)
router.post('/leaves/employee/:employeeId/initialize', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const result = await LeaveService.initializeBalances(req.user, req.params.employeeId, year);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Populate the year's balances for every active employee at once — the
// organisation-wide "configure the system" action.
router.post('/leaves/populate-yearly', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const year = req.body?.year ? Number(req.body.year) : undefined;
    const result = await LeaveService.populateYearlyForAll(req.user, year);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Process monthly accrual
router.post('/leaves/accrual/monthly', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const year = req.body?.year ? Number(req.body.year) : undefined;
    const month = req.body?.month ? Number(req.body.month) : undefined;
    const result = await LeaveService.processMonthlyAccrual(req.user, year, month);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
