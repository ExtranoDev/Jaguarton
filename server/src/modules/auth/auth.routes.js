const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./auth.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { MIN_PASSWORD_LENGTH } = require('../../utils/password');

const router = Router();

router.post(
  '/auth/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['driver', 'operator']).withMessage('Role must be driver or operator'),
  ],
  validate,
  controller.signup
);

router.post(
  '/auth/login',
  [
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  controller.login
);

router.get('/auth/me', requireAuth, controller.me);

router.patch(
  '/auth/me',
  requireAuth,
  [body('name').isString().trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }).withMessage('Name is too long')],
  validate,
  controller.updateMe
);

router.post(
  '/auth/change-password',
  requireAuth,
  [
    body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isString()
      .isLength({ min: MIN_PASSWORD_LENGTH })
      .withMessage(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  ],
  validate,
  controller.changePassword
);

module.exports = router;
