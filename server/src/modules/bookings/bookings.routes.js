const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./bookings.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');

const router = Router();

router.post(
  '/bookings',
  requireAuth,
  requireRole('driver'),
  [body('slotId').isInt({ min: 1 }).withMessage('slotId is required')],
  validate,
  controller.create
);

// Must be registered before '/bookings/:id' so "me" isn't captured as :id.
router.get('/bookings/me', requireAuth, requireRole('driver'), controller.mine);

router.get('/operator/bookings', requireAuth, requireRole('operator'), controller.operatorList);

router.get('/bookings/:id', requireAuth, controller.detail);

router.patch('/bookings/:id/cancel', requireAuth, requireRole('driver'), controller.cancel);

module.exports = router;
