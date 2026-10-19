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
 * Sends a password reset one-time code.
 * The raw OTP only ever appears in this email; only its hash is stored.
 */
async function sendPasswordResetOtp(email, otp, expiryMinutes) {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('SMTP is not configured — password reset email was not sent');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  await transport.sendMail({
    from: `"${env.EMAIL_FROM_NAME}" <${env.SMTP_USER}>`,
    to: email,
    subject: `${otp} is your ${env.APP_NAME} verification code`,
    text: [
      'We received a request to reset your ' + env.APP_NAME + ' password.',
      '',
      'Your verification code is: ' + otp,
      '',
      'This code expires in ' + expiryMinutes + ' minutes and can be used once.',
      '',
      'If you did not request this, you can ignore this email and your password will stay the same.',
    ].join('\n'),
    html: `
      <p>We received a request to reset your ${env.APP_NAME} password.</p>
      <p>Your verification code is:</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:16px 0;">${otp}</p>
      <p>This code expires in <strong>${expiryMinutes} minutes</strong> and can be used once.</p>
      <p>If you did not request this, you can ignore this email and your password will stay the same.</p>
    `,
  });

  logger.info('Password reset email sent', { email });
  return { sent: true };
}

/**
 * Sends an invitation email containing the one-time acceptance link.
 * The link points at the frontend acceptance page; the recipient is the
 * exact email saved on the new account. Returns { sent: true } on success,
 * or { sent: false, reason } when SMTP is not configured — callers must not
 * treat a delivery failure as an invitation failure.
 */
async function sendInvitationEmail(email, token, role) {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('SMTP is not configured — invitation email was not sent', {
      email,
      role,
    });
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const acceptUrl = `${env.APP_URL}/auth/invite/accept?token=${encodeURIComponent(token)}`;

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject: `You have been invited to join ${env.APP_NAME}`,
    text: [
      `You have been invited to join ${env.APP_NAME} as a ${role}.`,
      '',
      'To set your password and activate your account, open the link below:',
      acceptUrl,
      '',
      'This invitation expires in 7 days. If you did not expect this invitation, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>You have been invited to join <strong>${env.APP_NAME}</strong> as a <strong>${role}</strong>.</p>
      <p>To set your password and activate your account, open the link below:</p>
      <p><a href="${acceptUrl}">${acceptUrl}</a></p>
      <p>This invitation expires in 7 days. If you did not expect this invitation, you can ignore this email.</p>
    `,
  });

  logger.info('Invitation email sent', { email, role });
  return { sent: true };
}

/**
 * Sends an account creation email containing the temporary password.
 * The recipient uses this password to log in for the first time.
 */
async function sendAccountCreatedEmail(email, name, password, role) {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('SMTP is not configured — account creation email was not sent', {
      email,
      role,
    });
    return { sent: false, reason: 'smtp_not_configured' };
  }

  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject: `Your ${env.APP_NAME} account has been created`,
    text: [
      `Your ${env.APP_NAME} account has been created.`,
      '',
      `Email: ${email}`,
      `Temporary password: ${password}`,
      '',
      'Please log in with this temporary password and change it after your first login.',
    ].join('\n'),
    html: `
      <p>Your ${env.APP_NAME} account has been created.</p>
      <p>Email: ${email}</p>
      <p>Temporary password: <strong>${password}</strong></p>
      <p>Please log in with this temporary password and change it after your first login.</p>
    `,
  });

  logger.info('Account creation email sent', { email, role });
  return { sent: true };
}

module.exports = {
  sendPasswordResetOtp,
  sendInvitationEmail,
  sendAccountCreatedEmail,
  getTransporter,
};
