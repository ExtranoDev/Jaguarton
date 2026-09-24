const { body, param, query } = require('express-validator');
const { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } = require('../utils/password');

// Shared express-validator chains, so every route rejects the same bad input the same way (400)
// instead of letting it reach the database. SQLite accepts almost anything, but Postgres raises
// on a non-numeric id, an id past INTEGER's range, text longer than VARCHAR(255) or a number
// that overflows a DECIMAL column, which used to surface as a 500.

const MAX_ID = 2147483647; // Postgres INTEGER

// Limits on free text. The columns are VARCHAR(255); these are the product limits under that.
const LIMITS = {
  personName: 100,
  email: 254, // the longest address SMTP allows
  stationName: 120,
  address: 255,
};

// Chargers: DECIMAL(6,2) kW and DECIMAL(8,2) naira per kWh. The bounds are what a real charger
// could plausibly be, well inside what the columns hold.
const POWER_KW = { gt: 0, max: 1000 };
const PRICE_PER_KWH = { gt: 0, max: 100000 };

const CONNECTOR_TYPES = ['Type2_AC', 'CCS2_DC', 'CHAdeMO_DC'];
const CHARGER_STATUSES = ['online', 'offline', 'unavailable'];

// express-validator runs isInt/isFloat/isIn on each element of an array, so `slotId: [1]` or a repeated
// query key (?status=a&status=b) would pass and then reach the database as an array. Every
// non-text rule therefore starts here.
const scalar = (location, name) => location(name).not().isArray().withMessage(`${name} must be a single value`).bail();

const intIn = (location, name, range, message) => scalar(location, name).isInt(range).withMessage(message).bail().toInt();
const floatIn = (location, name, range, message) =>
  scalar(location, name).isFloat(range).withMessage(message).bail().toFloat();
const oneOf = (location, name, values, message = `${name} must be one of ${values.join(', ')}`) =>
  scalar(location, name).isIn(values).withMessage(message);

const idRule = { min: 1, max: MAX_ID };
const idMessage = (name) => `${name} must be a positive whole number`;

const idParam = (name = 'id') => intIn(param, name, idRule, idMessage(name));
const idBody = (name) => intIn(body, name, idRule, idMessage(name));
const optionalIdQuery = (name) => intIn(query, name, idRule, idMessage(name)).optional({ values: 'falsy' });
const optionalIdBody = (name) => intIn(body, name, idRule, idMessage(name)).optional({ values: 'null' });

// A required piece of text: must really be a string (an object would otherwise be stored as
// "[object Object]"), is trimmed, and must fit.
function requiredText(location, name, max, label = name) {
  return location(name)
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${label} is required`)
    .bail()
    .isLength({ max })
    .withMessage(`${label} must be ${max} characters or fewer`);
}

// Emails are stored and compared in lower case, so Ada@X.com and ada@x.com are one account.
function emailBody(name = 'email') {
  return body(name)
    .isString()
    .withMessage('a valid email is required')
    .bail()
    .trim()
    .isLength({ max: LIMITS.email })
    .withMessage(`email must be ${LIMITS.email} characters or fewer`)
    .bail()
    .isEmail()
    .withMessage('a valid email is required')
    .bail()
    .customSanitizer((value) => value.toLowerCase());
}

// For a password being set. Existing shorter passwords keep working at login, which only
// checks that one was given.
function newPasswordBody(name, label = 'password') {
  return body(name)
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`${label} must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .bail()
    .isLength({ max: MAX_PASSWORD_LENGTH })
    .withMessage(`${label} must be ${MAX_PASSWORD_LENGTH} characters or fewer`);
}

function existingPasswordBody(name, label = 'password') {
  return body(name)
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .notEmpty()
    .withMessage(`${label} is required`)
    .bail()
    .isLength({ max: MAX_PASSWORD_LENGTH })
    .withMessage(`${label} must be ${MAX_PASSWORD_LENGTH} characters or fewer`);
}

const optionalFloatQuery = (name, range, message) => floatIn(query, name, range, message).optional({ values: 'falsy' });

module.exports = {
  MAX_ID,
  LIMITS,
  POWER_KW,
  PRICE_PER_KWH,
  CONNECTOR_TYPES,
  CHARGER_STATUSES,
  scalar,
  intIn,
  floatIn,
  oneOf,
  idParam,
  idBody,
  optionalIdQuery,
  optionalIdBody,
  requiredText,
  emailBody,
  newPasswordBody,
  existingPasswordBody,
  optionalFloatQuery,
};
