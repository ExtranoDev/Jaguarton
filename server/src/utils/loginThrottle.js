// Failed-login throttle: after MAX_FAILURES wrong passwords for one email from one IP within
// WINDOW_MS, further attempts (even with the right password) are refused with 429 until the
// oldest of those failures ages out. Unknown emails are counted exactly like real ones, so the
// throttle can't be used to find out which accounts exist.
//
// Kept in memory: the API runs as a single instance, and a restart only forgets at most one
// window's worth of failures. Move this to the database if the API is ever scaled out.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const SWEEP_AT_SIZE = 10000;

const failures = new Map(); // "email\nip" -> timestamps (ms) of recent failures, oldest first

const keyFor = (email, ip) => `${email}\n${ip}`;

function recentFailures(key, now) {
  const recent = (failures.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length > 0) failures.set(key, recent);
  else failures.delete(key);
  return recent;
}

// Seconds until another attempt is allowed, or 0 if one is allowed now.
function retryAfterSeconds(email, ip, now = Date.now()) {
  const recent = recentFailures(keyFor(email, ip), now);
  if (recent.length < MAX_FAILURES) return 0;
  const unlocksAt = recent[recent.length - MAX_FAILURES] + WINDOW_MS;
  return Math.max(1, Math.ceil((unlocksAt - now) / 1000));
}

function recordFailure(email, ip, now = Date.now()) {
  if (failures.size >= SWEEP_AT_SIZE) {
    for (const key of failures.keys()) recentFailures(key, now); // deleting while iterating a Map is safe
  }
  const key = keyFor(email, ip);
  failures.set(key, [...recentFailures(key, now), now]);
}

function clearFailures(email, ip) {
  failures.delete(keyFor(email, ip));
}

// For tests.
function resetLoginThrottle() {
  failures.clear();
}

module.exports = { WINDOW_MS, MAX_FAILURES, retryAfterSeconds, recordFailure, clearFailures, resetLoginThrottle };
