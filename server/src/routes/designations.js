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
    // The actual schema has no designations table, so expose a truthful
    // empty list rather than calling a missing Prisma model.
    res.json([]);
  } catch (err) {
    next(err);
  }
});

router.get('/designations/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  next(new AppError(AppErrorCodes.NOT_FOUND, 'Designations are not stored in the existing database schema.', 404));
});

router.post('/designations', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(createSchema), async (req, res, next) => {
  next(new AppError(AppErrorCodes.INVALID_INPUT, 'Designations cannot be created because the existing schema has no designations table.', 501));
});

router.patch('/designations/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(updateSchema), async (req, res, next) => {
  next(new AppError(AppErrorCodes.INVALID_INPUT, 'Designations cannot be updated because the existing schema has no designations table.', 501));
});

router.delete('/designations/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  next(new AppError(AppErrorCodes.INVALID_INPUT, 'Designations cannot be deleted because the existing schema has no designations table.', 501));
});

module.exports = router;
