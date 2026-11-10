const { PrismaClient } = require('@prisma/client');
const { getTransporter } = require('./email.service');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

let prisma;
function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * Approval notices for pending requests (leave / WFH / comp-off).
 *
 * When an employee submits a request, the people who actually review it are
 * emailed: the employee's reporting manager and every active HR Admin. The
 * email carries the request details plus a link straight to the review
 * screen, so the approver does not have to hunt for it.
 *
 * Best-effort by design: every failure (no recipients, SMTP down, transient
 * error) is logged and swallowed — a notification problem must never block
 * or fail the request itself.
 *
 * @param {object} opts
 * @param {string|number} opts.actorUserId    users.id of the employee
 * @param {string} opts.subject               e.g. "New leave request"
 * @param {string[]} opts.details              one line per bullet
 * @param {string} opts.reviewPath             app path of the review screen
 */
async function notifyForApproval({ actorUserId, subject, details = [], reviewPath }) {
  const prismaClient = getPrisma();

  // 1) Resolve who should hear about it.
  const employeeRows = await prismaClient.$queryRawUnsafe(
    'SELECT userId, name FROM employees WHERE userId = ? LIMIT 1',
    actorUserId
  );
  if (!employeeRows.length) {
    return { sent: 0, reason: 'no_employee_row' };
  }
  const employeeName = String(employeeRows[0].name || '');

  // Reporting manager's login email (the manager is an employee record with
  // a linked user account).
  const managerRows = await prismaClient.$queryRawUnsafe(
    `SELECT u.email
       FROM employees e
       JOIN users u ON u.id = e.userId
      WHERE e.id = (SELECT reportingManagerId FROM employees WHERE userId = ? LIMIT 1)
        AND u.email IS NOT NULL AND u.email <> ''`,
    actorUserId
  );

  // All active HR Admins — they are the fallback approvers.
  const hrRows = await prismaClient.$queryRawUnsafe(
    `SELECT email FROM users
      WHERE role = 'HR_ADMIN' AND isActive = 1 AND email IS NOT NULL AND email <> ''`
  );

  const actorRow = await prismaClient.$queryRawUnsafe(
    'SELECT email FROM users WHERE id = ? LIMIT 1',
    actorUserId
  );
  const actorEmail = (actorRow[0]?.email || '').toLowerCase();

  // De-duplicate; never mail the requestor about their own request.
  const recipients = [...managerRows.map((r) => r.email), ...hrRows.map((r) => r.email)]
    .filter((e) => e && e.toLowerCase() !== actorEmail)
    .map((e) => e.toLowerCase())
    .filter((e, i, arr) => arr.indexOf(e) === i);

  if (!recipients.length) {
    logger.info('Approval notice skipped — no recipients', { actorUserId });
    return { sent: 0, reason: 'no_recipients' };
  }

  // 2) Deliver. SMTP may be absent (local dev) — that is not an error.
  const transport = getTransporter();
  if (!transport) {
    logger.warn('Approval notice not sent — SMTP not configured', {
      actorUserId,
      recipients: recipients.length,
    });
    return { sent: 0, reason: 'smtp_not_configured' };
  }

  const reviewUrl = `${env.APP_URL}${reviewPath}`;
  const bullets = details.map((d) => `• ${d}`).join('\n');

  try {
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: recipients,
      subject: `${subject}${employeeName ? ` — ${employeeName}` : ''}`,
      text: [
        `${employeeName || 'An employee'} has a pending request that needs review:`,
        '',
        bullets,
        '',
        `Review it here: ${reviewUrl}`,
        '',
        '— This is an automated notice from ' + env.APP_NAME + '.',
      ].join('\n'),
      html: `
        <p><strong>${employeeName || 'An employee'}</strong> has a pending request that needs review:</p>
        <ul style="list-style:none;padding:0;margin:12px 0;">
          ${details.map((d) => `<li style="margin:2px 0;">• ${d}</li>`).join('\n')}
        </ul>
        <p><a href="${reviewUrl}" style="background:#0891b2;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;">Review in ${env.APP_NAME}</a></p>
        <p style="color:#64748b;font-size:12px;margin-top:16px;">This is an automated notice from ${env.APP_NAME}.</p>
      `,
    });
  } catch (err) {
    // Best-effort: a delivery failure is logged and swallowed, it never
    // fails the underlying request.
    logger.warn('Approval notice failed to send', {
      actorUserId,
      subject,
      error: err.message,
    });
    return { sent: 0, reason: 'send_failed' };
  }

  logger.info('Approval notice sent', {
    actorUserId,
    recipients: recipients.length,
    subject,
  });
  return { sent: recipients.length, recipients };
}

module.exports = { notifyForApproval };
