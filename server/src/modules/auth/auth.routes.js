const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./auth.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');

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

module.exports = router;
