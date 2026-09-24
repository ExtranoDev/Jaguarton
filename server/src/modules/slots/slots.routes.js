const { Router } = require('express');
const { body, query } = require('express-validator');
const controller = require('./slots.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth, optionalAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { intIn, oneOf, idParam, optionalIdBody } = require('../../middleware/validators');

const router = Router();

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

router.get(
  '/chargers/:id/slots',
  optionalAuth,
  [idParam(), query('date').optional().isString().matches(DATE_FORMAT).withMessage('date must be YYYY-MM-DD')],
  validate,
  controller.listForCharger
);

router.post(
  '/chargers/:id/slots',
  requireAuth,
  requireRole('operator'),
  [
    idParam(),
    body('date').isString().matches(DATE_FORMAT).withMessage('date must be YYYY-MM-DD'),
    intIn(body, 'startHour', { min: 0, max: 23 }, 'startHour must be 0-23').optional(),
    intIn(body, 'endHour', { min: 1, max: 24 }, 'endHour must be 1-24').optional(),
    intIn(body, 'durationMinutes', { min: 15, max: 240 }, 'durationMinutes must be 15-240').optional(),
  ],
  validate,
  controller.generate
);

router.post(
  '/operator/slots/top-up',
  requireAuth,
  requireRole('operator'),
  [intIn(body, 'days', { min: 1, max: 30 }, 'days must be between 1 and 30').optional(), optionalIdBody('stationId')],
  validate,
  controller.topUp
);

router.patch(
  '/slots/:id',
  requireAuth,
  requireRole('operator'),
  [idParam(), oneOf(body, 'status', ['available', 'blocked'])],
  validate,
  controller.updateStatus
);

router.delete('/slots/:id', requireAuth, requireRole('operator'), [idParam()], validate, controller.remove);

module.exports = router;
