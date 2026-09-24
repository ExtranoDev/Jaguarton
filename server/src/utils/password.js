const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;
// Minimum for every password that is set (signup, account, admin). Older, shorter passwords
// still work at login.
const MIN_PASSWORD_LENGTH = 8;
// bcrypt only reads the first 72 bytes anyway; the cap stops huge inputs being hashed.
const MAX_PASSWORD_LENGTH = 128;
// No look-alikes (0/O, 1/l/I), so a temporary password can be read out or typed from a screen.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

// A login for an email with no account still runs one bcrypt comparison against this, so it takes
// as long as a wrong password for a real account and response time can't reveal who is registered.
let dummyHash;
async function burnPasswordCheck(password) {
  dummyHash ||= hashPassword(crypto.randomBytes(16).toString('hex'));
  await bcrypt.compare(password, await dummyHash);
  return false;
}

function generateTemporaryPassword(length = 12) {
  return Array.from(crypto.randomBytes(length), (byte) => TEMP_ALPHABET[byte % TEMP_ALPHABET.length]).join('');
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
  burnPasswordCheck,
  generateTemporaryPassword,
};
