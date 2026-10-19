const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { UserManagementService } = require('../services/user-management.service');
const { Role } = require('../types/index');

const router = express.Router();

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  // The service refuses any role outside this list, and the route is
  // SUPER_ADMIN-only, so a caller cannot mint another Super Admin here.
  role: z.enum(['HR_ADMIN', 'EMPLOYEE', 'SUPER_ADMIN']),
  // Kept for compatibility with the older create flow; the New Account page
  // uses the invitation flow instead and never sends a password.
  password: z.string().min(8).max(128).optional(),
  // Optional employee link: when supplied the account is tied to the matching
  // employees row and its reportingManagerId is set from the manager name.
  employeeCode: z.string().trim().min(1).max(50).optional(),
  reportingManager: z.string().trim().max(120).optional(),
});

const statusSchema = z.object({
  isActive: z.boolean(),
});

router.use(authenticate);

// Super Admin and HR Admin can provision HR Admin and Employee accounts.
router.get('/admin-users', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    // The query selects which list to show. It does not grant anything: the
    // caller's authority comes from the verified session, not from this value.
    const roleParam = req.query.role || 'HR_ADMIN';
    const roles = roleParam.split(',').map((r) => r.trim()).filter(Boolean);
    const accounts = await UserManagementService.listByRoles(roles);
    res.json(accounts);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/admin-users',
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(createSchema),
  async (req, res, next) => {
    try {
      const account = await UserManagementService.create(req.user, req.body);
      res.status(201).json(account);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/admin-users/:id/status',
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(statusSchema),
  async (req, res, next) => {
    try {
      const result = await UserManagementService.setActive(req.user, req.params.id, req.body.isActive);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
