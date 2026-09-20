const { validationResult } = require('express-validator');
const { BadRequestError } = require('../utils/errors');

// Place after express-validator check(...) chains on a route to turn
// validation failures into a consistent 400 response.
function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const message = result.array().map((e) => `${e.path}: ${e.msg}`).join(', ');
    return next(new BadRequestError(message));
  }
  return next();
}

module.exports = { validate };
