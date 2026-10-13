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

module.exports = { Role, signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
