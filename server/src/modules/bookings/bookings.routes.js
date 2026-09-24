const { Router } = require('express');
const { body, query } = require('express-validator');
const controller = require('./bookings.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { oneOf, idParam, idBody, optionalIdQuery } = require('../../middleware/validators');

const router = Router();

router.post('/bookings', requireAuth, requireRole('driver'), [idBody('slotId')], validate, controller.create);

// Must be registered before '/bookings/:id' so "me" isn't captured as :id.
router.get('/bookings/me', requireAuth, requireRole('driver'), controller.mine);

router.get(
  '/operator/bookings',
  requireAuth,
  requireRole('operator'),
  [
    optionalIdQuery('stationId'),
    optionalIdQuery('chargerId'),
    oneOf(query, 'status', ['confirmed', 'cancelled']).optional({ values: 'falsy' }),
  ],
  validate,
  controller.operatorList
);

// An operator cancels a booking at one of their stations; a reason (5+ characters) is required.
router.patch(
  '/operator/bookings/:id/cancel',
  requireAuth,
  requireRole('operator'),
  [idParam(), body('reason').optional({ values: 'null' }).isString().withMessage('reason must be text').bail().isLength({ max: 500 }).withMessage('reason must be 500 characters or fewer')],
  validate,
  controller.operatorCancel
);

router.get('/bookings/:id', requireAuth, [idParam()], validate, controller.detail);

router.patch('/bookings/:id/cancel', requireAuth, requireRole('driver'), [idParam()], validate, controller.cancel);

module.exports = router;
