const { AppError } = require('../utils/errors');
const { clientErrorFromDb } = require('../utils/dbErrors');

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// express.json() reports a malformed or oversized body as an error with a 4xx `status` and a `type`.
const BODY_ERRORS = {
  'entity.parse.failed': 'The request body is not valid JSON',
  'entity.too.large': 'The request body is too large',
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    if (err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds));
    return res.status(err.statusCode).json({ ...err.details, error: err.message });
  }

  if (err.type && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: BODY_ERRORS[err.type] || 'The request body could not be read' });
  }

  const clientError = clientErrorFromDb(err);
  if (clientError) {
    // Validation should have caught this first, so it is worth seeing in the logs.
    console.warn(`${req.method} ${req.originalUrl} -> ${clientError.status}: ${err.code} ${err.message}`);
    return res.status(clientError.status).json({ error: clientError.message });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFoundHandler, errorHandler };
