const bcrypt = require('bcrypt');

async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, 12);
}

async function comparePassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

module.exports = { hashPassword, comparePassword };
