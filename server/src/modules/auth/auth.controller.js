const authService = require('./auth.service');
const asyncHandler = require('../../utils/asyncHandler');

const signup = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const result = await authService.signup({ name, email, password, role });
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  res.status(200).json(result);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.user.id);
  res.status(200).json({ user });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.id, { name: req.body.name });
  res.status(200).json({ user });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, {
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });
  res.status(200).json({ message: 'Password updated' });
});

module.exports = { signup, login, me, updateMe, changePassword };
