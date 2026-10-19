const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { HolidayService } = require('../services/holiday.service');
const { Role } = require('../types/index');

const router = express.Router();

const createSchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  isRecurring: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().min(1).optional(),
  isRecurring: z.boolean().optional(),
});

router.use(authenticate);

router.get('/holidays', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE), async (req, res, next) => {
  try {
    const holidays = await HolidayService.list(req.user);
    res.json(holidays);
  } catch (err) {
    next(err);
  }
});

router.get('/holidays/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE), async (req, res, next) => {
  try {
    const holiday = await HolidayService.getById(req.user, req.params.id);
    res.json(holiday);
  } catch (err) {
    next(err);
  }
});

router.post('/holidays', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(createSchema), async (req, res, next) => {
  try {
    const holiday = await HolidayService.create(req.user, req.body);
    res.status(201).json(holiday);
  } catch (err) {
    next(err);
  }
});

router.patch('/holidays/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(updateSchema), async (req, res, next) => {
  try {
    const holiday = await HolidayService.update(req.user, req.params.id, req.body);
    res.json(holiday);
  } catch (err) {
    next(err);
  }
});

router.delete('/holidays/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await HolidayService.delete(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
