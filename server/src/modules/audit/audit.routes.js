const { Router } = require('express');
const { query } = require('express-validator');
const auditService = require('./audit.service');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate.middleware');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { intIn, optionalIdQuery } = require('../../middleware/validators');

const router = Router();

// An operator's read-only history of what happened at their own stations (the admin's view is
// /admin/audit-log). Other people's emails are masked.
router.get(
  '/operator/history',
  requireAuth,
  requireRole('operator'),
  [
    optionalIdQuery('stationId'),
    ...['from', 'to'].map((name) =>
      query(name).optional({ values: 'falsy' }).isString().bail().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage(`${name} must be YYYY-MM-DD`)
    ),
    intIn(query, 'page', { min: 1, max: 100000 }, 'page must be a positive whole number').optional(),
    intIn(query, 'pageSize', { min: 1, max: 100 }, 'pageSize must be between 1 and 100').optional(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { stationId, from, to, page, pageSize } = req.query;
    const result = await auditService.listForOperator(req.user.id, {
      stationId: stationId || undefined,
      from: from || undefined,
      to: to || undefined,
      page: page || 1,
      pageSize: pageSize || 50,
    });
    res.status(200).json(result);
  })
);

module.exports = router;
