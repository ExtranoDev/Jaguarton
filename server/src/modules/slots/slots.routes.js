const { Router } = require('express');
const { body, query } = require('express-validator');
const controller = require('./slots.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');

const router = Router();

router.get(
  '/chargers/:id/slots',
  [query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD')],
  validate,
  controller.listForCharger
);

router.post(
  '/chargers/:id/slots',
  requireAuth,
  requireRole('operator'),
  [
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
    body('startHour').optional().isInt({ min: 0, max: 23 }),
    body('endHour').optional().isInt({ min: 1, max: 24 }),
    body('durationMinutes').optional().isInt({ min: 15, max: 240 }),
  ],
  validate,
  controller.generate
);

router.post(
  '/operator/slots/top-up',
  requireAuth,
  requireRole('operator'),
  [
    body('days').optional().isInt({ min: 1, max: 30 }).withMessage('days must be between 1 and 30'),
    body('stationId').optional().isInt({ min: 1 }),
  ],
  validate,
  controller.topUp
);

router.patch(
  '/slots/:id',
  requireAuth,
  requireRole('operator'),
  [body('status').isIn(['available', 'blocked']).withMessage('status must be available or blocked')],
  validate,
  controller.updateStatus
);

router.delete('/slots/:id', requireAuth, requireRole('operator'), controller.remove);

module.exports = router;
