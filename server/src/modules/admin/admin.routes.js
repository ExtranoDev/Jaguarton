const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./admin.controller');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { MIN_PASSWORD_LENGTH } = require('../../utils/password');

const router = Router();

const idParam = param('id').isInt({ min: 1 }).withMessage('id must be a positive integer');
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
    query('role').optional({ values: 'falsy' }).isIn(['driver', 'operator', 'admin']).withMessage('role must be driver, operator or admin'),
    query('q').optional({ values: 'falsy' }).isString().isLength({ max: 100 }).withMessage('q is too long'),
  ],
  validate,
  controller.listUsers
);
const ROLES = ['driver', 'operator', 'admin'];
const nameBody = body('name')
  .isString()
  .trim()
  .notEmpty()
  .withMessage('name is required')
  .isLength({ max: 100 })
  .withMessage('name is too long');
const emailBody = body('email').isString().trim().isEmail().withMessage('a valid email is required');
const roleBody = body('role').isIn(ROLES).withMessage('role must be driver, operator or admin');
const passwordMessage = `password must be at least ${MIN_PASSWORD_LENGTH} characters`;

router.post(
  '/admin/users',
  [nameBody, emailBody, roleBody, body('password').isString().isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(passwordMessage)],
  validate,
  controller.createUser
);
router.put('/admin/users/:id', [idParam, nameBody, emailBody, roleBody], validate, controller.updateUser);
router.post(
  '/admin/users/:id/reset-password',
  [idParam, body('password').optional().isString().isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(passwordMessage)],
  validate,
  controller.resetUserPassword
);
router.patch('/admin/users/:id', [idParam, isActiveBody], validate, controller.setUserActive);

router.get('/admin/stations', controller.listStations);
router.patch('/admin/stations/:id', [idParam, isActiveBody], validate, controller.setStationActive);

router.patch(
  '/admin/chargers/:id/status',
  [idParam, body('status').isIn(['online', 'offline', 'unavailable']).withMessage('status must be online, offline or unavailable')],
  validate,
  controller.setChargerStatus
);

router.get(
  '/admin/bookings',
  [
    query('status').optional({ values: 'falsy' }).isIn(['confirmed', 'cancelled']).withMessage('status must be confirmed or cancelled'),
    query('stationId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('stationId must be a positive integer'),
    query('date').optional({ values: 'falsy' }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
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
  [query('days').optional().isInt({ min: 1, max: 30 }).withMessage('days must be between 1 and 30')],
  validate,
  controller.slotCoverage
);
router.post(
  '/admin/slots/top-up',
  [body('days').optional().isInt({ min: 1, max: 30 }).withMessage('days must be between 1 and 30')],
  validate,
  controller.topUpSlots
);

router.get(
  '/admin/audit-log',
  [query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200')],
  validate,
  controller.auditLog
);

module.exports = router;
