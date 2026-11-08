const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validate');
const { AttendanceService } = require('../services/attendance.service');
const { Role } = require('../types/index');

const router = express.Router();

const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
});

const summaryQuerySchema = z.object({
  startDate: z.string().default(''),
  endDate: z.string().default(''),
});

const matrixQuerySchema = z.object({
  year: z.coerce.number().int().positive().default(new Date().getFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(new Date().getMonth() + 1),
});

// Punch in — any authenticated user punches in for themselves or authorized roles for their target
router.post('/attendance/punch-in', authenticate, async (req, res, next) => {
  try {
    const { employeeId, workMode } = req.body;
    const result = await AttendanceService.punchIn(req.user, { employeeId, workMode });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Punch out
router.post('/attendance/punch-out', authenticate, async (req, res, next) => {
  try {
    const { employeeId } = req.body;
    const result = await AttendanceService.punchOut(req.user, { employeeId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get open session
router.get('/attendance/open-session', authenticate, async (req, res, next) => {
  try {
    const result = await AttendanceService.getOpenSession(req.user);
    res.json({ session: result });
  } catch (err) {
    next(err);
  }
});

// Get my attendance history (EMPLOYEE: self only, HR/ADMIN/SUPER_ADMIN: any via /employees/:id/history)
router.get('/attendance/my-history', authenticate, validateQuery(historyQuerySchema), async (req, res, next) => {
  try {
    const profileId = await AttendanceService.resolveTargetEmployee(req.user, req.user.id);
    const result = await AttendanceService.getHistory(req.user, profileId, {
      page: parseInt(req.query.page) || 1,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get attendance history for a specific employee (HR, ADMIN, SUPER_ADMIN)
router.get('/attendance/employees/:id/history', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateQuery(historyQuerySchema), async (req, res, next) => {
  try {
    const result = await AttendanceService.getHistory(req.user, req.params.id, {
      page: parseInt(req.query.page) || 1,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Month matrix — one row per active employee, day-by-day in/out times.
router.get('/attendance/matrix', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateQuery(matrixQuerySchema), async (req, res, next) => {
  try {
    const result = await AttendanceService.getMatrix(req.user, {
      year: req.query.year,
      month: req.query.month,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Self-only month matrix for the employee calendar (same look as the HR
// matrix, but just the employee's own row, plus per-day metadata: weekly off
// / holiday / locked-by-device / self-punch-allowed flags).
router.get('/attendance/my-matrix', authenticate, validateQuery(matrixQuerySchema), async (req, res, next) => {
  try {
    const result = await AttendanceService.getMyMatrix(req.user, {
      year: req.query.year,
      month: req.query.month,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Employee applies a manual punch pair for a specific calendar day (the
// day-click flow). Only allowed on approved-WFH days without device data;
// device-import days are locked. Idempotent per day.
router.post('/attendance/apply-punch', authenticate, async (req, res, next) => {
  try {
    const { date, punchIn, punchOut } = req.body;
    const result = await AttendanceService.applyPunch(req.user, { date, punchIn, punchOut });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Get attendance summary for a specific employee. Employee self-access is enforced by AttendanceService.
router.get('/attendance/employees/:id/summary', authenticate, validateQuery(summaryQuerySchema), async (req, res, next) => {
  try {
    const result = await AttendanceService.getSummary(req.user, req.params.id, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
