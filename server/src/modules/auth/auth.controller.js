const authService = require('./auth.service');
const asyncHandler = require('../../utils/asyncHandler');
const { contextFrom } = require('../audit/audit.service');

const signup = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const result = await authService.signup({ name, email, password, role }, contextFrom(req));
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password }, contextFrom(req));
  res.status(200).json(result);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.user.id);
  res.status(200).json({ user });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, { name: req.body.name }, contextFrom(req));
  res.status(200).json({ user });
});

const changePassword = asyncHandler(async (req, res) => {
  // Every other session ends; the new token keeps this one signed in.
  const { token } = await authService.changePassword(
    req.user.id,
    { currentPassword: req.body.currentPassword, newPassword: req.body.newPassword },
    contextFrom(req)
  );
  res.status(200).json({ message: 'Password updated', token });
});

module.exports = { signup, login, me, updateMe, changePassword };
