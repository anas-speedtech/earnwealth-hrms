const jwt = require('jsonwebtoken');
const { env } = require('../config/env.js');
const { Role } = require('../types/index.js');

function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

/**
 * Password reset has a third step: the OTP proves inbox ownership, then a
 * short-lived token authorises the password change itself. It carries no
 * role and cannot be used as an access token.
 */
function signPasswordResetVerifyToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '10m' });
}

function verifyPasswordResetVerifyToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/**
 * The emailed reset LINK is a longer-lived, single-purpose JWT. It carries
 * the user id only — the password change itself goes through
 * resetPasswordWithLink, which also revokes all existing sessions, so a
 * leaked link is bounded to a 30-minute window.
 */
function signPasswordResetLinkToken(payload) {
  return jwt.sign({ ...payload, kind: 'password-reset-link' }, env.JWT_ACCESS_SECRET, {
    expiresIn: '30m',
  });
}

function verifyPasswordResetLinkToken(token) {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (decoded.kind !== 'password-reset-link') {
    throw new Error('Not a password reset link token');
  }
  return decoded;
}

module.exports = {
  Role,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signPasswordResetVerifyToken,
  verifyPasswordResetVerifyToken,
  signPasswordResetLinkToken,
  verifyPasswordResetLinkToken,
};
