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
// Optional here; the service insists on one (at least 5 characters) where it is required:
// suspend, deactivate, cancel, role change and password reset.
const reasonBody = body('reason')
  .optional({ values: 'null' })
  .isString()
  .withMessage('reason must be text')
  .bail()
  .trim()
  .isLength({ max: 500 })
  .withMessage('reason must be 500 characters or fewer');
// A real JSON boolean: the string "false" must not be read as truthy.
const isActiveBody = body('isActive')
  .custom((value) => typeof value === 'boolean')
  .withMessage('isActive must be true or false');

// The users and bookings lists are paged like the audit log.
const pageQuery = [
  intIn(query, 'page', { min: 1, max: 100000 }, 'page must be a positive whole number').optional(),
  intIn(query, 'pageSize', { min: 1, max: 100 }, 'pageSize must be between 1 and 100').optional(),
];

// Everything under /admin is admin-only. Authentication runs first (401), then the role (403).
router.use('/admin', requireAuth, requireRole('admin'));

router.get('/admin/overview', controller.overview);

router.get(
  '/admin/users',
  [
    oneOf(query, 'role', ['driver', 'operator', 'admin']).optional({ values: 'falsy' }),
    query('q').optional({ values: 'falsy' }).isString().isLength({ max: 100 }).withMessage('q is too long'),
    ...pageQuery,
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
router.put('/admin/users/:id', [idParam, nameBody, emailBody, roleBody, reasonBody], validate, controller.updateUser);
router.post(
  '/admin/users/:id/reset-password',
  [idParam, newPasswordBody('password').optional(), reasonBody],
  validate,
  controller.resetUserPassword
);
router.patch('/admin/users/:id', [idParam, isActiveBody, reasonBody], validate, controller.setUserActive);

router.get(
  '/admin/stations',
  [oneOf(query, 'approval', ['pending', 'approved', 'rejected', 'archived']).optional({ values: 'falsy' })],
  validate,
  controller.listStations
);
// Approve or reject (with a reason) a station waiting for approval.
router.patch(
  '/admin/stations/:id/approval',
  [idParam, oneOf(body, 'decision', ['approve', 'reject']), reasonBody],
  validate,
  controller.reviewStation
);
router.patch('/admin/stations/:id', [idParam, isActiveBody, reasonBody], validate, controller.setStationActive);

router.patch(
  '/admin/chargers/:id/status',
  [
    idParam,
    oneOf(body, 'status', ['online', 'offline', 'unavailable']),
    body('confirm').optional().custom((value) => typeof value === 'boolean').withMessage('confirm must be true or false'),
  ],
  validate,
  controller.setChargerStatus
);

router.get(
  '/admin/bookings',
  [
    oneOf(query, 'status', ['confirmed', 'cancelled']).optional({ values: 'falsy' }),
    optionalIdQuery('stationId'),
    query('date').optional({ values: 'falsy' }).isString().bail().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
    ...pageQuery,
  ],
  validate,
  controller.listBookings
);
router.patch(
  '/admin/bookings/:id/cancel',
  [
    idParam,
    reasonBody,
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
  [
    ...['actor', 'target'].map((name) =>
      query(name).optional({ values: 'falsy' }).isString().withMessage(`${name} must be text`).bail().isLength({ max: 100 }).withMessage(`${name} is too long`)
    ),
    query('action').optional({ values: 'falsy' }).isString().bail().matches(/^[a-z_]+\.[a-z_]+$/).withMessage('action is not a known action'),
    oneOf(query, 'category', ['security', 'operator', 'booking', 'admin']).optional({ values: 'falsy' }),
    ...['from', 'to'].map((name) =>
      query(name).optional({ values: 'falsy' }).isString().bail().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage(`${name} must be YYYY-MM-DD`)
    ),
    intIn(query, 'page', { min: 1, max: 100000 }, 'page must be a positive whole number').optional(),
    intIn(query, 'pageSize', { min: 1, max: 100 }, 'pageSize must be between 1 and 100').optional(),
  ],
  validate,
  controller.auditLog
);

module.exports = router;
