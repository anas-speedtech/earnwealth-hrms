const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Math.max(1, parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5', 10)),
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again later.',
    },
  },
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

module.exports = { loginLimiter, apiLimiter, passwordResetLimiter };

