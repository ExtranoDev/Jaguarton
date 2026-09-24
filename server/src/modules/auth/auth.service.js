const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { jwtSecret } = require('../../config/env');
const {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  TooManyRequestsError,
} = require('../../utils/errors');
const { isUniqueViolation } = require('../../utils/dbErrors');
const { hashPassword, verifyPassword, burnPasswordCheck } = require('../../utils/password');
const loginThrottle = require('../../utils/loginThrottle');
const audit = require('../audit/audit.service');

const TOKEN_TTL = '7d';

// Emails are stored lower-case (migration 10); every lookup and write goes through this.
const normalizeEmail = (email) => String(email).trim().toLowerCase();

function toPublicUser(user) {
  const { password_hash: _passwordHash, token_version: _tokenVersion, ...publicUser } = user;
  // SQLite stores booleans as 0/1, Postgres as true/false.
  return { ...publicUser, is_active: Boolean(publicUser.is_active) };
}

// `tv` ties the token to the user's token_version: bumping that (password change or reset, role
// change) ends every session holding an older token.
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.token_version || 0 }, jwtSecret, { expiresIn: TOKEN_TTL });
}

const asActor = (user) => ({ id: user.id, role: user.role, name: user.name, email: user.email });

async function signup({ name, email, password, role }, context = {}) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await db('users').where({ email: normalizedEmail }).first();
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  try {
    return await db.transaction(async (trx) => {
      const [user] = await trx('users')
        .insert({ name, email: normalizedEmail, password_hash: passwordHash, role })
        .returning('*');
      await audit.record(trx, {
        action: 'auth.signup',
        context,
        actor: asActor(user),
        target: audit.userTarget(user),
        details: { role },
      });
      return { token: signToken(user), user: toPublicUser(user) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('An account with this email already exists');
    throw err;
  }
}

// Wrong password and unknown email look identical: same message, same status, the same bcrypt
// work, and both count towards the throttle for that email and IP. Both are logged (kept for 90
// days); the attempt that starts a lockout is logged as a lockout too.
async function login({ email, password }, context = {}) {
  const normalizedEmail = normalizeEmail(email);
  const ip = context.ip;
  const waitSeconds = loginThrottle.retryAfterSeconds(normalizedEmail, ip);
  if (waitSeconds > 0) {
    const minutes = Math.ceil(waitSeconds / 60);
    throw new TooManyRequestsError(
      `Too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      waitSeconds
    );
  }

  const user = await db('users').where({ email: normalizedEmail }).first();
  const passwordMatches = user ? await verifyPassword(password, user.password_hash) : await burnPasswordCheck(password);
  if (!passwordMatches) {
    const failures = loginThrottle.recordFailure(normalizedEmail, ip);
    const actor = user ? asActor(user) : { email: normalizedEmail };
    await audit.record(db, {
      action: 'auth.login_failed',
      context,
      actor,
      details: { knownAccount: Boolean(user), failuresInWindow: failures },
    });
    if (failures === loginThrottle.MAX_FAILURES) {
      await audit.record(db, {
        action: 'auth.lockout',
        context,
        actor,
        details: { failures, minutes: loginThrottle.WINDOW_MS / 60000 },
      });
    }
    throw new UnauthorizedError('Invalid email or password');
  }
  loginThrottle.clearFailures(normalizedEmail, ip);

  // Only after the password checks out, so this can't be used to probe which emails are suspended.
  if (!user.is_active) {
    await audit.record(db, { action: 'auth.login_suspended', context, actor: asActor(user) });
    throw new ForbiddenError('This account has been suspended');
  }

  await audit.record(db, { action: 'auth.login', context, actor: asActor(user) });
  return { token: signToken(user), user: toPublicUser(user) };
}

async function getUserById(id) {
  const user = await db('users').where({ id }).first();
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return toPublicUser(user);
}

async function updateProfile(userId, { name }, context = {}) {
  return db.transaction(async (trx) => {
    const before = await trx('users').where({ id: userId }).first();
    if (!before) throw new NotFoundError('User not found');
    const [user] = await trx('users')
      .where({ id: userId })
      .update({ name, updated_at: trx.fn.now() })
      .returning('*');
    const changes = audit.diff(before, user, ['name']);
    if (changes) {
      await audit.record(trx, { action: 'auth.profile_update', context, actor: asActor(user), target: audit.userTarget(user), changes });
    }
    return toPublicUser(user);
  });
}

// A wrong current password is a 400, not a 401: the client treats any 401 as "your session
// ended" and signs the user out, which is the wrong response to a typo.
// Changing the password ends every other session; the caller gets a fresh token to stay signed in.
async function changePassword(userId, { currentPassword, newPassword }, context = {}) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new NotFoundError('User not found');
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw new BadRequestError('Your current password is incorrect');
  }
  if (currentPassword === newPassword) {
    throw new BadRequestError('Choose a new password that is different from the current one');
  }
  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (trx) => {
    const [updated] = await trx('users')
      .where({ id: userId })
      .update({ password_hash: passwordHash, token_version: trx.raw('token_version + 1'), updated_at: trx.fn.now() })
      .returning('*');
    await audit.record(trx, { action: 'auth.password_change', context, actor: asActor(updated), target: audit.userTarget(updated) });
    return { token: signToken(updated) };
  });
}

module.exports = { signup, login, getUserById, updateProfile, changePassword, normalizeEmail };
