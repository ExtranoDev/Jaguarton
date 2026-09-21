const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { jwtSecret } = require('../../config/env');
const { ConflictError, UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } = require('../../utils/errors');
const { hashPassword, verifyPassword } = require('../../utils/password');

const TOKEN_TTL = '7d';

function toPublicUser(user) {
  const { password_hash: _passwordHash, ...publicUser } = user;
  // SQLite stores booleans as 0/1, Postgres as true/false.
  return { ...publicUser, is_active: Boolean(publicUser.is_active) };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: TOKEN_TTL });
}

async function signup({ name, email, password, role }) {
  const existing = await db('users').where({ email }).first();
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db('users')
    .insert({ name, email, password_hash: passwordHash, role })
    .returning('*');

  return { token: signToken(user), user: toPublicUser(user) };
}

async function login({ email, password }) {
  const user = await db('users').where({ email }).first();
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Only after the password checks out, so this can't be used to probe which emails are suspended.
  if (!user.is_active) {
    throw new ForbiddenError('This account has been suspended');
  }

  return { token: signToken(user), user: toPublicUser(user) };
}

async function getUserById(id) {
  const user = await db('users').where({ id }).first();
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return toPublicUser(user);
}

async function updateProfile(userId, { name }) {
  const [user] = await db('users')
    .where({ id: userId })
    .update({ name, updated_at: db.fn.now() })
    .returning('*');
  if (!user) throw new NotFoundError('User not found');
  return toPublicUser(user);
}

// A wrong current password is a 400, not a 401: the client treats any 401 as "your session
// ended" and signs the user out, which is the wrong response to a typo.
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new NotFoundError('User not found');
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw new BadRequestError('Your current password is incorrect');
  }
  if (currentPassword === newPassword) {
    throw new BadRequestError('Choose a new password that is different from the current one');
  }
  await db('users')
    .where({ id: userId })
    .update({ password_hash: await hashPassword(newPassword), updated_at: db.fn.now() });
}

module.exports = { signup, login, getUserById, updateProfile, changePassword };
