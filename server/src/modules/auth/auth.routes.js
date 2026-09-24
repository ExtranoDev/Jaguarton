const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./auth.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const {
  LIMITS,
  CONNECTOR_TYPES,
  oneOf,
  requiredText,
  emailBody,
  newPasswordBody,
  existingPasswordBody,
} = require('../../middleware/validators');

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

// Send either or both: a new name, and the connector(s) the driver's car takes ([] clears them).
router.patch(
  '/auth/me',
  requireAuth,
  [
    body()
      .custom((value) => value?.name !== undefined || value?.connectorTypes !== undefined)
      .withMessage('Send a name or connectorTypes to update'),
    requiredText(body, 'name', LIMITS.personName, 'Name').optional(),
    body('connectorTypes')
      .optional()
      .custom((value) => Array.isArray(value) && value.length <= 10 && value.every((type) => CONNECTOR_TYPES.includes(type)))
      .withMessage(`connectorTypes must be a list of: ${CONNECTOR_TYPES.join(', ')}`),
  ],
  validate,
  controller.updateMe
);

router.post(
  '/auth/change-password',
  requireAuth,
  [existingPasswordBody('currentPassword', 'Current password'), newPasswordBody('newPassword', 'New password')],
  validate,
  controller.changePassword
);

module.exports = router;
