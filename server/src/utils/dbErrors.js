// Detects a unique-constraint violation across both DB engines we support:
// SQLite (better-sqlite3 throws code 'SQLITE_CONSTRAINT_UNIQUE'/'SQLITE_CONSTRAINT')
// and Postgres (error code '23505').
function isUniqueViolation(err) {
  if (!err) return false;
  if (err.code === '23505') return true; // Postgres
  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) return true;
  return false;
}

module.exports = { isUniqueViolation };
