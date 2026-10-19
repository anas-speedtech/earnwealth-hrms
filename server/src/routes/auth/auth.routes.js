const express = require('express');
const { z } = require('zod');
const { loginLimiter, apiLimiter, passwordResetLimiter, otpVerifyLimiter } = require('../../middleware/rateLimiter');
const { authenticate, authorize } = require('../../middleware/auth');
const { validateBody } = require('../../middleware/validate');
const { AuthService } = require('../../services/auth.service');
const { Role } = require('../../types/index');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // The role of the login page the request came from. It only decides which
  // accounts are accepted; it never grants a role. A mismatch is rejected.
  expectedRole: z.enum(['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE']).optional(),
});

const refreshSchema = z.object({
  tokenId: z.string().uuid(),
  refreshToken: z.string().min(1),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});

const newPasswordSchema = z.object({
  verifyToken: z.string().min(1),
  password: z.string().min(8),
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['EMPLOYEE', 'HR_ADMIN', 'SUPER_ADMIN']),
});

// Public health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Login
router.post('/auth/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await AuthService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Refresh token
router.post('/auth/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const { tokenId, refreshToken } = req.body;
    const result = await AuthService.refresh(tokenId, refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Logout
router.post('/auth/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// Super Admin dashboard stats (real DB-backed counts)
router.get('/super-admin/stats', authenticate, authorize(Role.SUPER_ADMIN), async (req, res, next) => {
  try {
    const result = await AuthService.getSuperAdminStats();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get current user
router.get('/auth/me', authenticate, async (req, res, next) => {
  try {
    const profile = await AuthService.getMe(req.user.id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// Step 1: request a reset code
router.post('/auth/password/request', passwordResetLimiter, validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    const result = await AuthService.requestPasswordReset(req.body.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Step 2: verify the code, which returns a short-lived verification token
router.post('/auth/password/verify', otpVerifyLimiter, validateBody(verifyOtpSchema), async (req, res, next) => {
  try {
    const result = await AuthService.verifyPasswordResetOtp(req.body.email, req.body.otp);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Step 3: set the new password using the verification token
router.post('/auth/password/reset', validateBody(newPasswordSchema), async (req, res, next) => {
  try {
    const result = await AuthService.resetPassword(req.body.verifyToken, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Create invitation (SUPER_ADMIN only)
router.post('/auth/invite', authenticate, authorize(Role.SUPER_ADMIN), validateBody(inviteSchema), async (req, res, next) => {
  try {
    const result = await AuthService.createInvitation(req.body.email, req.body.role, req.user.id, req.body.name);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Accept invitation (public — uses token)
router.post('/auth/invite/accept', validateBody(z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})), async (req, res, next) => {
  try {
    const result = await AuthService.acceptInvitation(req.body.token, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Role-protected test endpoints
router.get('/auth/sa-dashboard', authenticate, authorize(Role.SUPER_ADMIN), (_req, res) => {
  res.json({ message: 'Welcome, Super Admin', role: Role.SUPER_ADMIN });
});

router.get('/auth/admin-dashboard', authenticate, authorize(Role.HR_ADMIN, Role.SUPER_ADMIN), (_req, res) => {
  res.json({ message: 'Welcome, HR Admin', role: 'HR_ADMIN' });
});

router.get('/auth/hr-dashboard', authenticate, authorize(Role.HR_ADMIN, Role.SUPER_ADMIN), (_req, res) => {
  res.json({ message: 'Welcome, HR Admin', role: 'HR_ADMIN' });
});

router.get('/auth/employee-dashboard', authenticate, authorize(Role.EMPLOYEE), (_req, res) => {
  res.json({ message: 'Welcome, Employee', role: 'EMPLOYEE' });
});

module.exports = router;
