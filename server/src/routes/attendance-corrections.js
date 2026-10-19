const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { AttendanceCorrectionService } = require('../services/attendance-correction.service');
const { Role } = require('../types/index');

const router = express.Router();

const createCorrectionSchema = z.object({
  attendanceId: z.string().uuid(),
  correctedPunchIn: z.string().datetime().optional(),
  correctedPunchOut: z.string().datetime().optional(),
  correctedStatus: z.string().optional(),
  reason: z.string().min(1),
});

const reviewSchema = z.object({
  reviewComment: z.string().optional(),
});

const listMySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
});

// List my correction requests
router.get('/attendance/corrections/my', authenticate, validateQuery(listMySchema), async (req, res, next) => {
  try {
    const result = await AttendanceCorrectionService.listMyCorrections(req.user, {
      page: parseInt(req.query.page) || 1,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Submit a correction request
router.post('/attendance/corrections', authenticate, validateBody(createCorrectionSchema), async (req, res, next) => {
  try {
    const correction = await AttendanceCorrectionService.create(req.user, req.body);
    res.status(201).json(correction);
  } catch (err) {
    next(err);
  }
});

// List pending corrections (HR, ADMIN, SUPER_ADMIN)
router.get('/attendance/corrections/pending', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const corrections = await AttendanceCorrectionService.listPending(req.user);
    res.json({ corrections });
  } catch (err) {
    next(err);
  }
});

// Approve correction
router.post('/attendance/corrections/:id/approve', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const result = await AttendanceCorrectionService.approve(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Reject correction
router.post('/attendance/corrections/:id/reject', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const result = await AttendanceCorrectionService.reject(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
