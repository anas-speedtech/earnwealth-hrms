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
router.get('/attendance/employees/:id/history', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateQuery(historyQuerySchema), async (req, res, next) => {
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
