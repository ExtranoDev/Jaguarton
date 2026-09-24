const { Router } = require('express');
const { body, query } = require('express-validator');
const controller = require('./admin.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const {
  LIMITS,
  idParam: sharedIdParam,
  intIn,
  oneOf,
  optionalIdQuery,
  requiredText,
  emailBody: sharedEmailBody,
  newPasswordBody,
} = require('../../middleware/validators');

const router = Router();

const idParam = sharedIdParam();
// A real JSON boolean: the string "false" must not be read as truthy.
const isActiveBody = body('isActive')
  .custom((value) => typeof value === 'boolean')
  .withMessage('isActive must be true or false');

// Everything under /admin is admin-only. Authentication runs first (401), then the role (403).
router.use('/admin', requireAuth, requireRole('admin'));

router.get('/admin/overview', controller.overview);

router.get(
  '/admin/users',
  [
    oneOf(query, 'role', ['driver', 'operator', 'admin']).optional({ values: 'falsy' }),
    query('q').optional({ values: 'falsy' }).isString().isLength({ max: 100 }).withMessage('q is too long'),
  ],
  validate,
  controller.listUsers
);
const ROLES = ['driver', 'operator', 'admin'];
const nameBody = requiredText(body, 'name', LIMITS.personName);
const emailBody = sharedEmailBody();
const roleBody = oneOf(body, 'role', ROLES);

router.post(
  '/admin/users',
  [nameBody, emailBody, roleBody, newPasswordBody('password')],
  validate,
  controller.createUser
);
router.put('/admin/users/:id', [idParam, nameBody, emailBody, roleBody], validate, controller.updateUser);
router.post(
  '/admin/users/:id/reset-password',
  [idParam, newPasswordBody('password').optional()],
  validate,
  controller.resetUserPassword
);
router.patch('/admin/users/:id', [idParam, isActiveBody], validate, controller.setUserActive);

router.get('/admin/stations', controller.listStations);
router.patch('/admin/stations/:id', [idParam, isActiveBody], validate, controller.setStationActive);

router.patch(
  '/admin/chargers/:id/status',
  [idParam, oneOf(body, 'status', ['online', 'offline', 'unavailable'])],
  validate,
  controller.setChargerStatus
);

router.get(
  '/admin/bookings',
  [
    oneOf(query, 'status', ['confirmed', 'cancelled']).optional({ values: 'falsy' }),
    optionalIdQuery('stationId'),
    query('date').optional({ values: 'falsy' }).isString().bail().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
  ],
  validate,
  controller.listBookings
);
router.patch(
  '/admin/bookings/:id/cancel',
  [
    idParam,
    body('reason')
      .isString()
      .withMessage('reason is required')
      .bail()
      .trim()
      .notEmpty()
      .withMessage('reason is required')
      .isLength({ max: 500 })
      .withMessage('reason must be 500 characters or fewer'),
  ],
  validate,
  controller.cancelBooking
);

router.get(
  '/admin/slot-coverage',
  [intIn(query, 'days', { min: 1, max: 30 }, 'days must be between 1 and 30').optional()],
  validate,
  controller.slotCoverage
);
router.post(
  '/admin/slots/top-up',
  [intIn(body, 'days', { min: 1, max: 30 }, 'days must be between 1 and 30').optional()],
  validate,
  controller.topUpSlots
);

router.get(
  '/admin/audit-log',
  [intIn(query, 'limit', { min: 1, max: 200 }, 'limit must be between 1 and 200').optional()],
  validate,
  controller.auditLog
);

module.exports = router;
