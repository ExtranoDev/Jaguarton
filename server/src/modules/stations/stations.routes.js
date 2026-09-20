const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./stations.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');

const router = Router();

const stationValidators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('lat must be a valid latitude'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('lng must be a valid longitude'),
];

router.get('/stations', controller.list);
router.get('/operator/stations', requireAuth, requireRole('operator'), controller.mine);
router.get('/stations/:id', controller.detail);
router.post('/stations', requireAuth, requireRole('operator'), stationValidators, validate, controller.create);
router.put('/stations/:id', requireAuth, requireRole('operator'), stationValidators, validate, controller.update);

module.exports = router;
