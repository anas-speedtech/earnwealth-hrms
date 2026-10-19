const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { EmployeeService } = require('../services/employee.service');
const { Role } = require('../types/index');

const router = express.Router();

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  search: z.string().default(''),
  departmentId: z.string().default(''),
  designationId: z.string().default(''),
  status: z.string().default(''),
});

const createSchema = z.object({
  email: z.string().email().optional(),
  employeeCode: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  designation: z.string().min(1),
  deviceEnrollNo: z.coerce.number().int().positive(),
  basicSalary: z.coerce.number().min(0),
  allowances: z.coerce.number().min(0).default(0),
  deductions: z.coerce.number().min(0).default(0),
  departmentId: z.coerce.string().optional().default(''),
  joiningDate: z.string(),
  status: z.string().default('ACTIVE').transform((value) => value.toUpperCase()),
  role: z.enum(['EMPLOYEE']).optional(),
  departmentText: z.string().optional(),
  reportingManagerId: z.coerce.number().int().positive().optional(),
});

const updateSchema = z.object({
  employeeCode: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  designation: z.string().min(1).optional(),
  departmentId: z.coerce.string().optional(),
  joiningDate: z.string().optional(),
  basicSalary: z.coerce.number().min(0).optional(),
  allowances: z.coerce.number().min(0).optional(),
  deductions: z.coerce.number().min(0).optional(),
  status: z.string().optional(),
  reportingManagerId: z.coerce.number().int().positive().nullable().optional(),
});

// All endpoints require authentication
// Specific role authorization enforced per endpoint
router.use(authenticate);

// List employees — SUPER_ADMIN, ADMIN, HR
router.get('/employees', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const query = {
      page: parseInt(req.query.page) || 1,
      search: req.query.search || '',
      departmentId: req.query.departmentId || '',
      designationId: req.query.designationId || '',
      status: req.query.status || '',
    };
    const result = await EmployeeService.list(req.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get single employee
router.get('/employees/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE), async (req, res, next) => {
  try {
    const result = await EmployeeService.getById(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Create employee — SUPER_ADMIN, ADMIN, HR
router.post('/employees', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(createSchema), async (req, res, next) => {
  try {
    const result = await EmployeeService.create(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Update employee — SUPER_ADMIN, ADMIN, HR
router.patch('/employees/:id', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(updateSchema), async (req, res, next) => {
  try {
    const result = await EmployeeService.update(req.user, req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Deactivate employee — SUPER_ADMIN, ADMIN
router.post('/employees/:id/deactivate', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await EmployeeService.deactivate(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Activate employee — SUPER_ADMIN, ADMIN
router.post('/employees/:id/activate', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await EmployeeService.activate(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
