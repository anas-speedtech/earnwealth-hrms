const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

let transporter;

/**
 * Returns a nodemailer transporter, or null when SMTP is not configured.
 * Callers must handle null: the reset flow still completes, it just cannot
 * deliver the email.
 */
function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: env.SMTP_SECURE === true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Sends a password reset link to the user.
 * The raw token is only ever placed in the emailed URL; only its hash is stored.
 */
async function sendPasswordResetEmail(email, rawToken) {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('SMTP is not configured — password reset email was not sent');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;

  await transport.sendMail({
    from: `"${env.EMAIL_FROM_NAME}" <${env.SMTP_USER}>`,
    to: email,
    subject: 'Reset your EWS HRMS password',
    text: `We received a request to reset your EWS HRMS password.\n\nUse the link below to choose a new password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email and your password will stay the same.`,
    html: `
      <p>We received a request to reset your EWS HRMS password.</p>
      <p>Use the link below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
      <p><a href="${resetUrl}">Reset my password</a></p>
      <p>If the button does not work, copy this URL into your browser:<br>${resetUrl}</p>
      <p>If you did not request this, you can ignore this email and your password will stay the same.</p>
    `,
  });

  logger.info('Password reset email sent', { email });
  return { sent: true };
}

module.exports = { sendPasswordResetEmail, getTransporter };
