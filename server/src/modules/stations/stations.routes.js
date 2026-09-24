const { Router } = require('express');
const { body, query } = require('express-validator');
const controller = require('./stations.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth, optionalAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const {
  LIMITS,
  CONNECTOR_TYPES,
  CHARGER_STATUSES,
  floatIn,
  oneOf,
  idParam,
  requiredText,
  optionalFloatQuery,
} = require('../../middleware/validators');

const router = Router();

const stationValidators = [
  requiredText(body, 'name', LIMITS.stationName, 'Name'),
  requiredText(body, 'address', LIMITS.address, 'Address'),
  floatIn(body, 'lat', { min: -90, max: 90 }, 'lat must be a valid latitude'),
  floatIn(body, 'lng', { min: -180, max: 180 }, 'lng must be a valid longitude'),
];

const listValidators = [
  optionalFloatQuery('lat', { min: -90, max: 90 }, 'lat must be a valid latitude'),
  optionalFloatQuery('lng', { min: -180, max: 180 }, 'lng must be a valid longitude'),
  optionalFloatQuery('radiusKm', { gt: 0, max: 20000 }, 'radiusKm must be a positive distance'),
  optionalFloatQuery('minPrice', { min: 0, max: 1e6 }, 'minPrice must be a price'),
  optionalFloatQuery('maxPrice', { min: 0, max: 1e6 }, 'maxPrice must be a price'),
  oneOf(query, 'status', CHARGER_STATUSES).optional({ values: 'falsy' }),
  oneOf(query, 'connectorType', CONNECTOR_TYPES).optional({ values: 'falsy' }),
];

router.get('/stations', optionalAuth, listValidators, validate, controller.list);
router.get('/operator/stations', requireAuth, requireRole('operator'), controller.mine);
router.get('/stations/:id', [idParam()], validate, optionalAuth, controller.detail);
router.post('/stations', requireAuth, requireRole('operator'), stationValidators, validate, controller.create);
router.put('/stations/:id', requireAuth, requireRole('operator'), [idParam(), ...stationValidators], validate, controller.update);
// Archive ({ archived: true }) or restore ({ archived: false }) one of your stations.
router.patch(
  '/stations/:id/archive',
  requireAuth,
  requireRole('operator'),
  [idParam(), body('archived').custom((value) => typeof value === 'boolean').withMessage('archived must be true or false')],
  validate,
  controller.archive
);

module.exports = router;
