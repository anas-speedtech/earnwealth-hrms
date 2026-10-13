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
});

const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  description: z.string().optional(),
  code: z.string().min(1).max(20),
  classification: z.enum(['PAID', 'UNPAID']).default('PAID'),
  isHalfDayAllowed: z.boolean().default(true),
  isActive: z.boolean().default(true),
  annualEntitlementDays: z.coerce.number().min(0).default(0),
  accrualFrequency: z.enum(['ANNUAL', 'MONTHLY']).default('ANNUAL'),
  monthlyAccrualDays: z.coerce.number().optional().nullable(),
  carryForwardEnabled: z.boolean().default(false),
  maxCarryForwardDays: z.coerce.number().optional().nullable(),
  minDaysBeforeApply: z.coerce.number().int().min(0).default(0),
  maxConsecutiveDays: z.coerce.number().int().optional().nullable(),
  applicableTo: z.string().default('ALL'),
  departmentIds: z.string().optional().nullable(),
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

// Get leave request detail
router.get('/leaves/:id', authenticate, async (req, res, next) => {
  try {
    const result = await LeaveService.getRequestDetail(req.user, req.params.id);
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
router.get('/leaves/pending', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), async (req, res, next) => {
  try {
    const requests = await LeaveService.getPendingRequests(req.user);
    res.json(requests);
  } catch (err) {
    next(err);
  }
});

// Get all leave requests (with filters)
router.get('/leaves/all', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateQuery(z.object({
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

// Get employee leave balances (HR view)
router.get('/leaves/employee/:employeeId/balances', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), async (req, res, next) => {
  try {
    const result = await LeaveService.getEmployeeBalances(req.user, req.params.employeeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Approve leave request
router.post('/leaves/:id/approve', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const result = await LeaveService.approveRequest(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Reject leave request
router.post('/leaves/:id/reject', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateBody(z.object({
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
router.get('/leave-types', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), async (req, res, next) => {
  try {
    const types = await LeaveService.getAllLeaveTypes(req.user);
    res.json(types);
  } catch (err) {
    next(err);
  }
});

// Create leave type
router.post('/leave-types', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateBody(createLeaveTypeSchema), async (req, res, next) => {
  try {
    const result = await LeaveService.createLeaveType(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Update leave type
router.put('/leave-types/:id', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateBody(updateLeaveTypeSchema), async (req, res, next) => {
  try {
    const result = await LeaveService.updateLeaveType(req.user, req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============ BALANCE MANAGEMENT ============

// Initialize balances for an employee
router.post('/leaves/employee/:employeeId/initialize', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), async (req, res, next) => {
  try {
    const result = await LeaveService.initializeBalances(req.user, req.params.employeeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Process monthly accrual
router.post('/leaves/accrual/monthly', authenticate, authorize(Role.SUPER_ADMIN, Role.HR), async (req, res, next) => {
  try {
    const result = await LeaveService.processMonthlyAccrual(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
