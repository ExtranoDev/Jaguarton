const db = require('../../config/db');
const { BadRequestError } = require('../../utils/errors');
const { dayBounds, isValidDateString, toIsoString } = require('../../utils/time');

// One history of security events, operator changes, the booking lifecycle and admin actions.
// Entries snapshot who did what to whom (names and emails as they were at the time) and never
// reference other rows, so they survive renames and deletions. See migration 11.

const FAILED_LOGIN_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_REASON_LENGTH = 5;
const DEFAULT_PAGE_SIZE = 50;

// Who and where a request came from. Built by the controller from `req` and passed to services.
function contextFrom(req) {
  return {
    actor: req.user || null,
    ip: req.ip || null,
    userAgent: (req.get?.('user-agent') || '').slice(0, 255) || null,
  };
}

function categoryFor(action, actorRole) {
  if (action.startsWith('auth.')) return 'security';
  if (action.startsWith('booking.')) return 'booking';
  return actorRole === 'admin' ? 'admin' : 'operator';
}

// Snapshots for the usual targets.
const userTarget = (user) => ({ type: 'user', id: user.id, name: user.name, email: user.email });
const stationTarget = (station) => ({ type: 'station', id: station.id, name: station.name });
const chargerTarget = (charger, station) => ({ type: 'charger', id: charger.id, name: `Charger #${charger.id} · ${station.name}` });
const bookingTarget = (booking, driverEmail) => ({ type: 'booking', id: booking.id, name: booking.booking_reference, email: driverEmail });
// Where an event happened, so the station's operator can see it in their history.
const atStation = (station) => ({ stationId: station.id, ownerId: station.owner_id });

// { field: { from, to } } for the fields that differ, or null if none do.
function diff(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    const from = before?.[field] ?? null;
    const to = after?.[field] ?? null;
    if (String(from) !== String(to)) changes[field] = { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// Actions that need a written reason (suspend, deactivate, cancel, role change, password reset).
function requireReason(reason, what) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < MIN_REASON_LENGTH) {
    throw new BadRequestError(`A reason of at least ${MIN_REASON_LENGTH} characters is required to ${what}`);
  }
  return text;
}

const toJson = (value) => (value == null ? null : JSON.stringify(value));

// Writes one entry. Pass the transaction the change itself runs in, so both succeed or neither.
// `actor` may be partial (a failed login only knows the email that was typed).
async function record(
  conn,
  { action, context = {}, actor = context.actor, target = null, stationId = null, ownerId = null, reason = null, changes = null, details = null }
) {
  const now = new Date();
  await conn('audit_log').insert({
    created_at: now.toISOString(),
    action,
    category: categoryFor(action, actor?.role),
    actor_id: actor?.id ?? null,
    actor_role: actor?.role ?? null,
    actor_name: actor?.name ?? null,
    actor_email: actor?.email ?? null,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    target_name: target?.name ? String(target.name).slice(0, 255) : null,
    target_email: target?.email ?? null,
    station_id: stationId,
    owner_id: ownerId,
    reason: reason || null,
    changes: toJson(changes),
    details: toJson(details),
    ip: context.ip ?? null,
    user_agent: context.userAgent ?? null,
    expires_at: action === 'auth.login_failed' ? new Date(now.getTime() + FAILED_LOGIN_RETENTION_DAYS * DAY_MS).toISOString() : null,
  });
}

// Failed logins are the only entries that expire. Returns how many were removed.
async function purgeExpired(now = new Date()) {
  return db('audit_log').whereNotNull('expires_at').andWhere('expires_at', '<', now.toISOString()).del();
}

// ------------------------------------------------------------------------------ reading

const parseJson = (text) => {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

function toEntry(row) {
  return {
    id: row.id,
    created_at: toIsoString(row.created_at),
    action: row.action,
    category: row.category,
    actor: row.actor_id == null && row.actor_email == null ? null : { id: row.actor_id, role: row.actor_role, name: row.actor_name, email: row.actor_email },
    target: row.target_type == null ? null : { type: row.target_type, id: row.target_id, name: row.target_name, email: row.target_email },
    station_id: row.station_id,
    reason: row.reason,
    changes: parseJson(row.changes),
    details: parseJson(row.details),
    ip: row.ip,
    user_agent: row.user_agent,
  };
}

const escapeLike = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);
const likeAny = (builder, columns, text) => {
  const pattern = `%${escapeLike(text.toLowerCase())}%`;
  builder.where((inner) => {
    for (const column of columns) inner.orWhereRaw(`lower(${column}) like ? escape '\\'`, [pattern]);
  });
};

function applyDateRange(query, from, to) {
  for (const date of [from, to]) {
    if (date && !isValidDateString(date)) throw new BadRequestError('Dates must be real dates in YYYY-MM-DD format');
  }
  if (from && to && from > to) throw new BadRequestError('"from" must be on or before "to"');
  if (from) query.andWhere('created_at', '>=', dayBounds(from).start.toISOString());
  if (to) query.andWhere('created_at', '<', dayBounds(to).end.toISOString());
}

async function page(query, { page: pageNumber = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  const [{ n }] = await query.clone().clearSelect().clearOrder().count('* as n');
  const rows = await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(pageSize)
    .offset((pageNumber - 1) * pageSize);
  return { rows, total: Number(n), page: pageNumber, pageSize };
}

// Admins: everything, filtered by actor (name or email), action, category, target (name, email, or
// "type:id") and a date range in APP_TIMEZONE, newest first, one page at a time.
async function listForAdmin({ actor, action, category, target, from, to, page: pageNumber, pageSize } = {}) {
  const query = db('audit_log').select('*');
  if (actor) likeAny(query, ['actor_name', 'actor_email'], actor);
  if (action) query.andWhere('action', action);
  if (category) query.andWhere('category', category);
  if (target) {
    const typed = /^([a-z]+):(\d+)$/.exec(target.trim());
    if (typed) query.andWhere({ target_type: typed[1], target_id: Number(typed[2]) });
    else likeAny(query, ['target_name', 'target_email'], target);
  }
  applyDateRange(query, from, to);

  const [result, actionRows] = await Promise.all([
    page(query, { page: pageNumber, pageSize }),
    db('audit_log').distinct('action').orderBy('action'),
  ]);
  return {
    entries: result.rows.map(toEntry),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    actions: actionRows.map((row) => row.action),
  };
}

// "chidi@example.com" -> "c***@example.com"
function maskEmail(email) {
  if (!email) return email;
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

// Operators: read-only history of what happened at their own stations. Other people's emails are
// masked, admins are not named, and IP addresses and browsers are left out.
function toOperatorEntry(row, operatorId) {
  const entry = toEntry(row);
  if (entry.actor && entry.actor.id !== operatorId) {
    entry.actor = entry.actor.role === 'admin'
      ? { id: null, role: 'admin', name: 'EChargeFind admin', email: null }
      : { ...entry.actor, id: null, email: maskEmail(entry.actor.email) };
  }
  if (entry.target?.email) entry.target = { ...entry.target, email: maskEmail(entry.target.email) };
  delete entry.ip;
  delete entry.user_agent;
  return entry;
}

async function listForOperator(operatorId, { stationId, from, to, page: pageNumber, pageSize } = {}) {
  const query = db('audit_log').select('*').where('owner_id', operatorId);
  if (stationId) query.andWhere('station_id', stationId);
  applyDateRange(query, from, to);
  const result = await page(query, { page: pageNumber, pageSize });
  return {
    entries: result.rows.map((row) => toOperatorEntry(row, operatorId)),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

module.exports = {
  FAILED_LOGIN_RETENTION_DAYS,
  MIN_REASON_LENGTH,
  contextFrom,
  userTarget,
  stationTarget,
  chargerTarget,
  bookingTarget,
  atStation,
  diff,
  requireReason,
  record,
  purgeExpired,
  listForAdmin,
  listForOperator,
  maskEmail,
};
