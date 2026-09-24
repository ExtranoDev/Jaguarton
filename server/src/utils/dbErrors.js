// Detects a unique-constraint violation across both DB engines we support:
// SQLite (better-sqlite3 throws code 'SQLITE_CONSTRAINT_UNIQUE'/'SQLITE_CONSTRAINT')
// and Postgres (error code '23505').
function isUniqueViolation(err) {
  if (!err) return false;
  if (err.code === '23505') return true; // Postgres
  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) return true;
  return false;
}

// Last line of defence for bad input that got past validation: a database error that means "the
// request's data was wrong" becomes a 4xx instead of a 500. Returns null for anything else
// (connection failures, SQL bugs), which stays a 500.
function clientErrorFromDb(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return { status: 409, message: 'That conflicts with an existing record' };
  }
  if (code === '23503' || code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return { status: 409, message: 'That refers to a record that does not exist or is still in use' };
  }
  // Postgres class 22 (data exception: bad number/date/text, value out of range, too long) and
  // 23502/23514 (not-null / check violations), and their SQLite counterparts.
  if (/^22[0-9A-Z]{3}$/.test(code) || ['23502', '23514', 'SQLITE_CONSTRAINT_NOTNULL', 'SQLITE_CONSTRAINT_CHECK', 'SQLITE_MISMATCH', 'SQLITE_TOOBIG', 'SQLITE_RANGE'].includes(code)) {
    return { status: 400, message: 'One of the values in the request is invalid or out of range' };
  }
  return null;
}

module.exports = { isUniqueViolation, clientErrorFromDb };
