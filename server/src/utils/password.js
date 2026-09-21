const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;
// Minimum for passwords set through the account and admin screens (signup keeps its own, older rule).
const MIN_PASSWORD_LENGTH = 8;
// No look-alikes (0/O, 1/l/I), so a temporary password can be read out or typed from a screen.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

function generateTemporaryPassword(length = 12) {
  return Array.from(crypto.randomBytes(length), (byte) => TEMP_ALPHABET[byte % TEMP_ALPHABET.length]).join('');
}

module.exports = { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword, generateTemporaryPassword };
