const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./chargers.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');

const router = Router();

const CONNECTOR_TYPES = ['Type2_AC', 'CCS2_DC', 'CHAdeMO_DC'];
const CHARGER_STATUSES = ['online', 'offline', 'unavailable'];

const chargerValidators = [
  body('connectorType').isIn(CONNECTOR_TYPES).withMessage(`connectorType must be one of ${CONNECTOR_TYPES.join(', ')}`),
  body('powerKw').isFloat({ min: 0 }).withMessage('powerKw must be a positive number'),
  body('pricePerKwh').isFloat({ min: 0 }).withMessage('pricePerKwh must be a positive number'),
  body('status').optional().isIn(CHARGER_STATUSES).withMessage(`status must be one of ${CHARGER_STATUSES.join(', ')}`),
];

router.post(
  '/stations/:stationId/chargers',
  requireAuth,
  requireRole('operator'),
  chargerValidators,
  validate,
  controller.create
);

router.put(
  '/chargers/:id',
  requireAuth,
  requireRole('operator'),
  chargerValidators,
  validate,
  controller.update
);

router.patch(
  '/chargers/:id/status',
  requireAuth,
  requireRole('operator'),
  [body('status').isIn(CHARGER_STATUSES).withMessage(`status must be one of ${CHARGER_STATUSES.join(', ')}`)],
  validate,
  controller.updateStatus
);

module.exports = router;
