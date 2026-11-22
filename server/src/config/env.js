if (process.env.DOTENV_CONFIG_PATH) {
  require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
} else {
  require('dotenv/config');
}
const env = {
  PORT: process.env.PORT || 5002,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret-dev-only',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret-dev-only',
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  // Password reset needs SMTP to deliver the link. Without it the token is
  // created but unreachable, so the feature reports itself as unavailable
  // instead of claiming the email went out.
  PASSWORD_RESET_ENABLED: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  EMAIL_FROM: process.env.EMAIL_FROM || 'EWS HRMS <noreply@example.com>',
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || 'EWS HRMS',
  APP_NAME: process.env.APP_NAME || 'EWS HRMS',
  APP_URL: process.env.APP_URL || 'http://localhost:5173',
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  // The bootstrap Super Admin address. Kept here so the login rate limiter can
  // exempt the owner from lockout (see middleware/rateLimiter.js).
  BOOTSTRAP_SUPER_ADMIN_EMAIL: process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
  // Last day of the month whose attendance counts toward payroll. Payroll is
  // typically run on the 28th, before the month ends — without a cutoff the
  // remaining days read as absent and proration docks pay unfairly. Set to 0
  // (or leave unset) to use the full calendar month.
  PAYROLL_CUTOFF_DAY: Number(process.env.PAYROLL_CUTOFF_DAY) || 0,
};

// Build DATABASE_URL from DB_* fields if not explicitly provided.
// Explicit DATABASE_URL always takes precedence.
if (!env.DATABASE_URL && env.DB_HOST && env.DB_NAME && env.DB_USER) {
  const encodedUser = encodeURIComponent(env.DB_USER || '');
  const encodedPassword = encodeURIComponent(env.DB_PASSWORD || '');
  env.DATABASE_URL = `mysql://${encodedUser}:${encodedPassword}@${env.DB_HOST}:${env.DB_PORT || 3306}/${env.DB_NAME}`;
  process.env.DATABASE_URL = env.DATABASE_URL;
}

module.exports = { env };
