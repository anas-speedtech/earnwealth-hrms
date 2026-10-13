const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { WFHService } = require('../services/wfh.service');
const { Role } = require('../types/index');

const router = express.Router();

const createWfhSchema = z.object({
  requestDate: z.string().min(1),
  reason: z.string().min(1),
});

const reviewSchema = z.object({
  reviewComment: z.string().optional(),
});

const listMySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
});

const listAllSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  status: z.string().optional(),
});

// Submit WFH request
router.post('/wfh/requests', authenticate, validateBody(createWfhSchema), async (req, res, next) => {
  try {
    const result = await WFHService.create(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// List my WFH requests
router.get('/wfh/my-requests', authenticate, validateQuery(listMySchema), async (req, res, next) => {
  try {
    const result = await WFHService.listMyRequests(req.user, {
      page: parseInt(req.query.page) || 1,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Cancel my pending WFH request
router.post('/wfh/requests/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const result = await WFHService.cancel(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// List all pending WFH requests (HR, ADMIN, SUPER_ADMIN)
router.get('/wfh/requests/pending', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), async (req, res, next) => {
  try {
    const requests = await WFHService.listPending(req.user);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

// List all WFH requests (HR, ADMIN, SUPER_ADMIN)
router.get('/wfh/requests', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateQuery(listAllSchema), async (req, res, next) => {
  try {
    const result = await WFHService.listAll(req.user, {
      page: parseInt(req.query.page) || 1,
      status: req.query.status,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Approve WFH request
router.post('/wfh/requests/:id/approve', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const result = await WFHService.approve(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Reject WFH request
router.post('/wfh/requests/:id/reject', authenticate, authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.HR), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const result = await WFHService.reject(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
