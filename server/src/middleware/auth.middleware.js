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

module.exports = { requireAuth };
