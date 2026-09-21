const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { jwtSecret } = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

// The token only proves who the caller was when it was issued, so the account is
// re-read on every request: a suspended user is locked out immediately instead of
// keeping access until their token expires, and the role always comes from the DB.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'));
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch (err) {
    return next(new UnauthorizedError('Invalid or expired token'));
  }

  try {
    const user = await db('users').where({ id: payload.sub }).select('id', 'role', 'is_active').first();
    if (!user) return next(new UnauthorizedError('Invalid or expired token'));
    if (!user.is_active) return next(new ForbiddenError('This account has been suspended'));
    req.user = { id: user.id, role: user.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

// For public endpoints that show a signed-in operator less than everyone else (only their own
// stations). Anonymous callers, and tokens that are invalid, expired or suspended, simply get
// the ordinary public view; only a failure to look the user up is an error, so that a database
// problem can never quietly widen what an operator sees.
async function optionalAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next();

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch (err) {
    return next();
  }

  try {
    const user = await db('users').where({ id: payload.sub }).select('id', 'role', 'is_active').first();
    if (user && user.is_active) req.user = { id: user.id, role: user.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth, optionalAuth };
