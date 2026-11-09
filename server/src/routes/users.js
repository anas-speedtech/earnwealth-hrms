const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { UserManagementService } = require('../services/user-management.service');
const { PersonalProfileService } = require('../services/personal-profile.service');
const { AvatarService } = require('../services/avatar.service');
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
  // The employee code is entered manually by the HR Admin; it is unique and
  // immutable. A linked employee record is created for HR Admin and Employee
  // accounts alike — the Super Admin never reaches this path.
  // Rules: numbers only, at least 3 digits (leading zeros allowed), max 50.
  employeeCode: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Employee code must contain numbers only.')
    .min(3, 'Employee code must be at least 3 digits.')
    .max(50, 'Employee code must be at most 50 digits.'),
  designation: z.string().trim().max(100).optional(),
  reportingManager: z.string().trim().max(120).optional(),
  // Date of joining (item 4). `YYYY-MM-DD`; the service falls back to today
  // when omitted or malformed, so it is intentionally non-fatal here.
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Leave types this employee is configured for (item 1). An array of
  // leave-type ids (or names) — the service seeds a balance row per type.
  leaveTypes: z.array(z.string()).optional(),
});

const statusSchema = z.object({
  isActive: z.boolean(),
});

// Personal-information fields. Employees read/update only their own record;
// HR keeps these in the same table when provisioning.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const optionalDay = z.union([z.literal(''), z.string().regex(DAY_RE)]).optional().nullable();
const personalProfileSchema = z.object({
  address: z.string().max(500).optional().nullable(),
  dateOfBirth: optionalDay,
  emergencyContact: z.string().max(100).optional().nullable(),
  personalEmail: z.union([z.literal(''), z.string().email().max(255)]).optional().nullable(),
  anniversaryDate: optionalDay,
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

// ---- Personal information (employee reads/updates their own record) ----

// Get the calling user's personal profile (address, DOB, emergency contact,
// personal email, personal anniversary date).
router.get('/me/personal-profile', async (req, res, next) => {
  try {
    const profile = await PersonalProfileService.getForUser(req.user.id);
    res.json(profile || PersonalProfileService.emptyProfile());
  } catch (err) {
    next(err);
  }
});

// Update the calling user's personal profile (upsert).
router.put(
  '/me/personal-profile',
  validateBody(personalProfileSchema),
  async (req, res, next) => {
    try {
      const profile = await PersonalProfileService.upsertForUser(req.user.id, req.body);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Avatar (profile photo, stored in the DB, served via the API) ----
//
// The client sends a base64 data URL that it compressed in the browser
// (~250 KB), so the JSON body stays under the 1 MB app limit. Storing in
// MySQL (not disk) means UAT/Production need no nginx static block, no
// upload directory, and no filesystem permissions.

const avatarSchema = z.object({
  image: z.string().min(1).max(2_000_000),
});

// The calling user's avatar, or null when none is set.
router.get('/me/avatar', async (req, res, next) => {
  try {
    const avatar = await AvatarService.get(req.user.id);
    res.json(avatar);
  } catch (err) {
    next(err);
  }
});

// Upload / replace the calling user's avatar.
router.put('/me/avatar', validateBody(avatarSchema), async (req, res, next) => {
  try {
    const avatar = await AvatarService.set(req.user, req.body.image);
    res.json(avatar);
  } catch (err) {
    next(err);
  }
});

// Remove the calling user's avatar.
router.delete('/me/avatar', async (req, res, next) => {
  try {
    const result = await AvatarService.remove(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
