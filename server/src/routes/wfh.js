const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { WFHService } = require('../services/wfh.service');
const { WFHAllocationService } = require('../services/wfh-allocation.service');
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
router.get('/wfh/requests/pending', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const requests = await WFHService.listPending(req.user);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

// List all WFH requests (HR, ADMIN, SUPER_ADMIN)
router.get('/wfh/requests', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateQuery(listAllSchema), async (req, res, next) => {
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
router.post('/wfh/requests/:id/approve', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const result = await WFHService.approve(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Reject WFH request
router.post('/wfh/requests/:id/reject', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const result = await WFHService.reject(req.user, req.params.id, req.body.reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---- Standing WFH allocation (Configuration → WFH Allocation) ----
// HR exempts an employee (by code) from device attendance; the employee
// self-punches their day (today only — past/future stay locked).
const allocateWfhSchema = z.object({
  employeeCode: z.string().min(1).max(50),
});

// List active allocations
router.get('/wfh/allocations', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const allocations = await WFHAllocationService.list(req.user);
    res.json({ allocations });
  } catch (err) {
    next(err);
  }
});

// Allocate by employee code
router.post('/wfh/allocations', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(allocateWfhSchema), async (req, res, next) => {
  try {
    const result = await WFHAllocationService.allocate(req.user, req.body.employeeCode);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Revoke by employee code
router.delete('/wfh/allocations/:employeeCode', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await WFHAllocationService.revoke(req.user, req.params.employeeCode);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
