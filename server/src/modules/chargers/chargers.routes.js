const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./chargers.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { POWER_KW, PRICE_PER_KWH, CONNECTOR_TYPES, CHARGER_STATUSES, floatIn, oneOf, idParam } = require('../../middleware/validators');

const router = Router();

const chargerValidators = [
  oneOf(body, 'connectorType', CONNECTOR_TYPES),
  floatIn(body, 'powerKw', POWER_KW, `powerKw must be more than 0 and at most ${POWER_KW.max}`),
  floatIn(body, 'pricePerKwh', PRICE_PER_KWH, `pricePerKwh must be more than 0 and at most ${PRICE_PER_KWH.max}`),
  oneOf(body, 'status', CHARGER_STATUSES).optional(),
];

router.post(
  '/stations/:stationId/chargers',
  requireAuth,
  requireRole('operator'),
  [idParam('stationId'), ...chargerValidators],
  validate,
  controller.create
);

router.put('/chargers/:id', requireAuth, requireRole('operator'), [idParam(), ...chargerValidators], validate, controller.update);

router.patch(
  '/chargers/:id/status',
  requireAuth,
  requireRole('operator'),
  [idParam(), oneOf(body, 'status', CHARGER_STATUSES)],
  validate,
  controller.updateStatus
);

module.exports = router;
