const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { jwtSecret } = require('../../config/env');
const { ConflictError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../../utils/errors');

const SALT_ROUNDS = 10;
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

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
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

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
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

module.exports = { signup, login, getUserById };
