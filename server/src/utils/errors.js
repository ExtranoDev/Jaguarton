class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

// `details` are extra fields for the response body, e.g. { code, upcomingBookings } when the
// client must confirm before trying again.
class ConflictError extends AppError {
  constructor(message = 'Conflict', details = null) {
    super(message, 409);
    this.details = details;
  }
}

// Carries how long to wait, which the error handler sends as a Retry-After header.
class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', retryAfterSeconds = 60) {
    super(message, 429);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
};
