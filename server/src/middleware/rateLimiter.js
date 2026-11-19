const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

// The bootstrap Super Admin is the one account that can recover every other
// account, so the login limiter must never lock them out.
const ADMIN_EMAIL = (env.BOOTSTRAP_SUPER_ADMIN_EMAIL || '').trim().toLowerCase();

// The email address from the login body, normalised for matching. Null when
// the body is missing or malformed (the limiter then falls back to the IP key).
function loginEmail(req) {
  const email = req.body && req.body.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Math.max(1, parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5', 10)),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again later.',
    },
  },
  // Key the counter on the login email address (per user), not the client IP.
  // Behind the reverse proxy (trust proxy enabled) every client collapses to a
  // single req.ip, so an IP-keyed limiter let a handful of failed attempts
  // lock out ALL accounts at once — including the Super Admin. Per-user keys
  // mean one account's failures only lock that account out.
  keyGenerator: (req) => {
    const email = loginEmail(req);
    return email ? `login-email:${email}` : `login-ip:${req.ip}`;
  },
  // Never rate-limit the Super Admin login.
  skip: (req) => ADMIN_EMAIL !== '' && loginEmail(req) === ADMIN_EMAIL,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Requests for a reset code are capped hourly so the endpoint cannot be used
// to mail-bomb a user.
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many password reset attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Guessing a 6-digit code is otherwise cheap, so verification is limited per
// IP. Codes also expire in 5 minutes and are single use.
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many code attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, apiLimiter, passwordResetLimiter, otpVerifyLimiter };
