const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./auth.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { LIMITS, oneOf, requiredText, emailBody, newPasswordBody, existingPasswordBody } = require('../../middleware/validators');

const router = Router();

router.post(
  '/auth/signup',
  [
    requiredText(body, 'name', LIMITS.personName, 'Name'),
    emailBody(),
    newPasswordBody('password', 'Password'),
    oneOf(body, 'role', ['driver', 'operator'], 'Role must be driver or operator'),
  ],
  validate,
  controller.signup
);

router.post(
  '/auth/login',
  [emailBody(), existingPasswordBody('password', 'Password')],
  validate,
  controller.login
);

router.get('/auth/me', requireAuth, controller.me);

router.patch('/auth/me', requireAuth, [requiredText(body, 'name', LIMITS.personName, 'Name')], validate, controller.updateMe);

router.post(
  '/auth/change-password',
  requireAuth,
  [existingPasswordBody('currentPassword', 'Current password'), newPasswordBody('newPassword', 'New password')],
  validate,
  controller.changePassword
);

module.exports = router;
