const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { DepartmentService } = require('../services/department.service');
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

router.get('/departments', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const departments = await DepartmentService.list(req.user);
    res.json(departments);
  } catch (err) {
    next(err);
  }
});

router.get('/departments/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const dept = await DepartmentService.getById(req.user, req.params.id);
    res.json(dept);
  } catch (err) {
    next(err);
  }
});

router.post('/departments', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(createSchema), async (req, res, next) => {
  try {
    const dept = await DepartmentService.create(req.user, req.body);
    res.status(201).json(dept);
  } catch (err) {
    next(err);
  }
});

router.patch('/departments/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(updateSchema), async (req, res, next) => {
  try {
    const dept = await DepartmentService.update(req.user, req.params.id, req.body);
    res.json(dept);
  } catch (err) {
    next(err);
  }
});

router.delete('/departments/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await DepartmentService.delete(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
