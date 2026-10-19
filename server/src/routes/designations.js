const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { validateBody } = require('../middleware/validate');
const { DesignationService } = require('../services/designation.service');
const { Role } = require('../types/index');

const router = express.Router();

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.use(authenticate);

router.get('/designations', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await DesignationService.list(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/designations/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await DesignationService.getById(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/designations', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(createSchema), async (req, res, next) => {
  try {
    const result = await DesignationService.create(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/designations/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(updateSchema), async (req, res, next) => {
  try {
    const result = await DesignationService.update(req.user, req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/designations/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await DesignationService.delete(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
