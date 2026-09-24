const db = require('../../config/db');
const { NotFoundError, ConflictError, BadRequestError } = require('../../utils/errors');
const {
  dayBounds,
  isValidDateString,
  toZonedDateString,
  addDaysToDateString,
  toIsoString,
} = require('../../utils/time');
const { isUniqueViolation } = require('../../utils/dbErrors');
const { hashPassword, generateTemporaryPassword } = require('../../utils/password');
const { detailedBookings, cancelConfirmed } = require('../bookings/bookings.service');
const audit = require('../audit/audit.service');
const { changeChargerStatus } = require('../chargers/chargers.service');
const { toStation, toCharger } = require('../stations/stations.service');
const { normalizeEmail } = require('../auth/auth.service');
const { topUpSlots } = require('../slots/slots.service');
const { buildSlotRows } = require('../slots/slotRows');

const DEFAULT_PAGE_SIZE = 50;
const UTILISATION_DAYS = 7;

// Every state-changing admin action writes an audit entry (audit.record) on the same transaction
// as the change itself, so an action and its entry succeed or fail together.

const count = (row) => Number(row?.n || 0);

// One page of a list, plus the total that matches the filters (the same shape as the audit log).
async function paged(query, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}, order) {
  const [{ n }] = await query.clone().clearSelect().clearOrder().count('* as n');
  const rows = await order(query)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total: Number(n), page, pageSize };
}

// ---------------------------------------------------------------- overview

async function getOverview() {
  const [userRows, stationRows, chargerRows, bookingRows, upcomingRow, utilisation] = await Promise.all([
    db('users').select('role', 'is_active').count('* as n').groupBy('role', 'is_active'),
    db('stations').select('is_active', 'approval_status').count('* as n').groupBy('is_active', 'approval_status'),
    db('chargers').select('status').count('* as n').groupBy('status'),
    db('bookings').select('status').count('* as n').groupBy('status'),
    db('bookings as b')
      .innerJoin('slots as sl', 'sl.id', 'b.slot_id')
      .where('b.status', 'confirmed')
      .andWhere('sl.start_time', '>', new Date().toISOString())
      .count('* as n')
      .first(),
    getUtilisation(),
  ]);

  const usersByRole = { driver: 0, operator: 0, admin: 0 };
  let suspended = 0;
  for (const row of userRows) {
    usersByRole[row.role] += count(row);
    if (!row.is_active) suspended += count(row);
  }

  const stationsActive = stationRows.filter((r) => r.is_active).reduce((sum, r) => sum + count(r), 0);
  const stationsTotal = stationRows.reduce((sum, r) => sum + count(r), 0);
  const stationsPending = stationRows.filter((r) => r.approval_status === 'pending').reduce((sum, r) => sum + count(r), 0);

  const chargersByStatus = { online: 0, offline: 0, unavailable: 0 };
  for (const row of chargerRows) chargersByStatus[row.status] += count(row);

  const bookingsByStatus = { confirmed: 0, cancelled: 0 };
  for (const row of bookingRows) bookingsByStatus[row.status] += count(row);

  return {
    users: {
      total: usersByRole.driver + usersByRole.operator + usersByRole.admin,
      drivers: usersByRole.driver,
      operators: usersByRole.operator,
      admins: usersByRole.admin,
      suspended,
    },
    stations: { total: stationsTotal, active: stationsActive, inactive: stationsTotal - stationsActive, pending: stationsPending },
    chargers: {
      total: chargersByStatus.online + chargersByStatus.offline + chargersByStatus.unavailable,
      ...chargersByStatus,
    },
    bookings: {
      total: bookingsByStatus.confirmed + bookingsByStatus.cancelled,
      ...bookingsByStatus,
      upcoming: count(upcomingRow),
    },
    utilisation,
  };
}

// How much of the next 7 days' (today included, in APP_TIMEZONE) bookable capacity is
// booked. Only slots that haven't started yet count: an unbooked slot from this morning is no
// longer capacity anyone could use. Capacity = booked slots + available slots that drivers could book: an online, unarchived
// charger at an active, approved, unarchived station whose operator isn't suspended. Blocked slots
// and slots nobody could book don't count against it.
// Grouping by start time (not by slot) keeps this small however many chargers exist.
async function getUtilisation() {
  const today = toZonedDateString(new Date());
  const dates = Array.from({ length: UTILISATION_DAYS }, (_, i) => addDaysToDateString(today, i));
  const windowStart = dayBounds(dates[0]).start;
  const windowEnd = dayBounds(dates[dates.length - 1]).end;

  const bookable =
    "CASE WHEN c.status = 'online' AND c.archived_at IS NULL AND s.is_active AND s.approval_status = 'approved' AND s.archived_at IS NULL AND owner.is_active THEN 1 ELSE 0 END";
  const rows = await db('slots as sl')
    .innerJoin('chargers as c', 'c.id', 'sl.charger_id')
    .innerJoin('stations as s', 's.id', 'c.station_id')
    .innerJoin('users as owner', 'owner.id', 's.owner_id')
    .where('sl.start_time', '>=', windowStart.toISOString())
    .andWhere('sl.start_time', '<', windowEnd.toISOString())
    .andWhere('sl.start_time', '>', new Date().toISOString())
    .select('sl.start_time', 'sl.status', db.raw(`${bookable} AS bookable`))
    .count('* as n')
    .groupByRaw(`sl.start_time, sl.status, ${bookable}`);

  const perDay = new Map(dates.map((date) => [date, { date, booked: 0, open: 0 }]));
  for (const row of rows) {
    const day = perDay.get(toZonedDateString(new Date(row.start_time)));
    if (!day) continue;
    if (row.status === 'booked') day.booked += count(row);
    else if (row.status === 'available' && Number(row.bookable) === 1) day.open += count(row);
  }

  const rate = (booked, open) => (booked + open === 0 ? null : Math.round((booked / (booked + open)) * 1000) / 10);
  const days = [...perDay.values()].map((day) => ({ ...day, rate: rate(day.booked, day.open) }));
  const booked = days.reduce((sum, day) => sum + day.booked, 0);
  const open = days.reduce((sum, day) => sum + day.open, 0);

  return { from: dates[0], to: dates[dates.length - 1], booked, open, rate: rate(booked, open), days };
}

// ------------------------------------------------------------------- users

function toAdminUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: Boolean(user.is_active),
    created_at: toIsoString(user.created_at),
  };
}

const escapeLike = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

async function listUsers({ role, q, page, pageSize } = {}) {
  let query = db('users').select('id', 'name', 'email', 'role', 'is_active', 'created_at');
  if (role) query = query.where({ role });
  if (q) {
    const pattern = `%${escapeLike(q.toLowerCase())}%`;
    query = query.andWhere((builder) =>
      builder
        .whereRaw("lower(name) like ? escape '\\'", [pattern])
        .orWhereRaw("lower(email) like ? escape '\\'", [pattern])
    );
  }
  const result = await paged(query, { page, pageSize }, (rows) => rows.orderBy('id'));
  return { users: result.rows.map(toAdminUser), total: result.total, page: result.page, pageSize: result.pageSize };
}

// Lock every active admin row so two admins removing each other at the same time are
// serialised: the second one then sees only itself left and is refused.
async function assertAnotherActiveAdmin(trx, targetId, message) {
  const activeAdmins = await trx('users')
    .where({ role: 'admin', is_active: true })
    .orderBy('id')
    .forUpdate()
    .select('id');
  if (!activeAdmins.some((admin) => admin.id !== targetId)) throw new ConflictError(message);
}

async function createUser(adminId, { name, email: rawEmail, role, password }, context = {}) {
  const email = normalizeEmail(rawEmail);
  const passwordHash = await hashPassword(password); // slow by design, so not inside the transaction
  return db.transaction(async (trx) => {
    if (await trx('users').where({ email }).first()) {
      throw new ConflictError('An account with this email already exists');
    }
    try {
      const [user] = await trx('users').insert({ name, email, role, password_hash: passwordHash }).returning('*');
      await audit.record(trx, {
        action: 'user.create',
        context,
        target: audit.userTarget(user),
        changes: audit.diff({}, user, ['name', 'email', 'role']),
      });
      return toAdminUser(user);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('An account with this email already exists');
      throw err;
    }
  });
}

// A role change needs a reason, and ends the user's sessions (their token says the old role).
async function updateUser(adminId, userId, { name, email: rawEmail, role, reason }, context = {}) {
  const email = normalizeEmail(rawEmail);
  return db.transaction(async (trx) => {
    const target = await trx('users').where({ id: userId }).first();
    if (!target) throw new NotFoundError('User not found');

    const changes = {};
    if (name !== target.name) changes.name = name;
    if (email !== target.email) changes.email = email;
    if (role !== target.role) changes.role = role;
    if (Object.keys(changes).length === 0) return toAdminUser(target);

    if (changes.email && (await trx('users').where({ email }).whereNot({ id: userId }).first())) {
      throw new ConflictError('An account with this email already exists');
    }

    if (changes.role) {
      if (target.id === adminId) throw new BadRequestError('You cannot change your own role');
      audit.requireReason(reason, "change someone's role");
      // Changing role must not strand data the old role owns: operator routes need an
      // operator, and a driver's bookings are shown to (and cancelled by) a driver.
      if (target.role === 'operator' && (await trx('stations').where({ owner_id: userId }).first())) {
        throw new ConflictError('This operator owns stations, so their role cannot be changed. Suspend the account instead');
      }
      if (target.role === 'driver' && (await trx('bookings').where({ user_id: userId }).first())) {
        throw new ConflictError('This driver has bookings, so their role cannot be changed. Suspend the account instead');
      }
      if (target.role === 'admin' && target.is_active) {
        await assertAnotherActiveAdmin(trx, target.id, 'Cannot change the role of the last active admin');
      }
    }

    try {
      const revokeSessions = changes.role ? { token_version: trx.raw('token_version + 1') } : {};
      const [updated] = await trx('users')
        .where({ id: userId })
        .update({ ...changes, ...revokeSessions, updated_at: trx.fn.now() })
        .returning('*');
      await audit.record(trx, {
        action: 'user.update',
        context,
        target: audit.userTarget(updated),
        changes: audit.diff(target, updated, ['name', 'email', 'role']),
        reason: changes.role ? reason.trim() : null,
      });
      return toAdminUser(updated);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('An account with this email already exists');
      throw err;
    }
  });
}

// Sets a new password, either the one the admin typed or a generated temporary one. The
// temporary password is returned once and never stored in readable form; the audit log records
// only that a reset happened. Every session the user already has ends.
async function resetUserPassword(adminId, userId, { password, reason } = {}, context = {}) {
  if (userId === adminId) {
    throw new BadRequestError('Use your account settings to change your own password');
  }
  const why = audit.requireReason(reason, "reset someone's password");
  const temporaryPassword = password ? undefined : generateTemporaryPassword();
  const passwordHash = await hashPassword(password || temporaryPassword);

  return db.transaction(async (trx) => {
    const target = await trx('users').where({ id: userId }).first();
    if (!target) throw new NotFoundError('User not found');
    await trx('users')
      .where({ id: userId })
      .update({ password_hash: passwordHash, token_version: trx.raw('token_version + 1'), updated_at: trx.fn.now() });
    await audit.record(trx, {
      action: 'user.reset_password',
      context,
      target: audit.userTarget(target),
      reason: why,
      details: { method: temporaryPassword ? 'temporary password generated' : 'password set by an admin' },
    });
    return { user: toAdminUser(target), temporaryPassword };
  });
}

// Suspending needs a reason; reactivating takes one optionally.
async function setUserActive(adminId, userId, isActive, reason, context = {}) {
  const why = isActive ? reason?.trim() || null : audit.requireReason(reason, 'suspend an account');
  return db.transaction(async (trx) => {
    const target = await trx('users').where({ id: userId }).first();
    if (!target) throw new NotFoundError('User not found');
    if (target.id === adminId) {
      throw new BadRequestError('You cannot change the status of your own account');
    }
    if (Boolean(target.is_active) === isActive) return toAdminUser(target);

    if (!isActive && target.role === 'admin') {
      await assertAnotherActiveAdmin(trx, target.id, 'Cannot suspend the last active admin');
    }

    const [updated] = await trx('users')
      .where({ id: userId })
      .update({ is_active: isActive, updated_at: trx.fn.now() })
      .returning('*');
    await audit.record(trx, {
      action: isActive ? 'user.reactivate' : 'user.suspend',
      context,
      target: audit.userTarget(updated),
      reason: why,
      changes: { is_active: { from: !isActive, to: isActive } },
    });
    return toAdminUser(updated);
  });
}

// ---------------------------------------------------------------- stations

// `approval`: 'pending' | 'approved' | 'rejected' to list only those; 'archived' for archived ones.
// Pending stations come first, oldest first, so the queue reads in order.
async function listStations({ approval } = {}) {
  let query = db('stations as s')
    .innerJoin('users as u', 'u.id', 's.owner_id')
    .select(
      's.id',
      's.name',
      's.address',
      's.lat',
      's.lng',
      's.is_active',
      's.approval_status',
      's.review_note',
      's.archived_at',
      's.created_at',
      's.owner_id',
      'u.name as owner_name',
      'u.email as owner_email',
      'u.is_active as owner_active'
    )
    .orderByRaw("CASE WHEN s.approval_status = 'pending' THEN 0 ELSE 1 END")
    .orderBy('s.id');
  if (approval === 'archived') query = query.whereNotNull('s.archived_at');
  else if (approval) query = query.where('s.approval_status', approval);

  const [stations, chargers] = await Promise.all([query, db('chargers').orderBy('id')]);
  return stations.map((station) => ({
    ...toStation(station),
    created_at: toIsoString(station.created_at),
    owner_active: Boolean(station.owner_active),
    chargers: chargers.filter((charger) => charger.station_id === station.id).map(toCharger),
  }));
}

// Approve a pending (or previously rejected) station so drivers can see it, or reject it with a
// reason the operator is shown. The operator can edit a rejected station, which resubmits it.
async function reviewStation(adminId, stationId, { decision, reason }, context = {}) {
  const approve = decision === 'approve';
  const why = approve ? reason?.trim() || null : audit.requireReason(reason, 'reject a station');
  return db.transaction(async (trx) => {
    const station = await trx('stations').where({ id: stationId }).first();
    if (!station) throw new NotFoundError('Station not found');
    const status = approve ? 'approved' : 'rejected';
    if (station.approval_status === status) return toStation(station);

    const [updated] = await trx('stations')
      .where({ id: stationId })
      .update({ approval_status: status, review_note: approve ? null : why, updated_at: trx.fn.now() })
      .returning('*');
    await audit.record(trx, {
      action: approve ? 'station.approve' : 'station.reject',
      context,
      target: audit.stationTarget(updated),
      ...audit.atStation(updated),
      reason: why,
      changes: audit.diff(station, updated, ['approval_status']),
    });
    return toStation(updated);
  });
}

// Deactivating needs a reason; reactivating takes one optionally.
async function setStationActive(adminId, stationId, isActive, reason, context = {}) {
  const why = isActive ? reason?.trim() || null : audit.requireReason(reason, 'deactivate a station');
  return db.transaction(async (trx) => {
    const station = await trx('stations').where({ id: stationId }).first();
    if (!station) throw new NotFoundError('Station not found');
    if (Boolean(station.is_active) === isActive) return { ...station, is_active: isActive };

    const [updated] = await trx('stations')
      .where({ id: stationId })
      .update({ is_active: isActive, updated_at: trx.fn.now() })
      .returning('*');
    await audit.record(trx, {
      action: isActive ? 'station.activate' : 'station.deactivate',
      context,
      target: audit.stationTarget(station),
      ...audit.atStation(station),
      reason: why,
      changes: { is_active: { from: !isActive, to: isActive } },
    });
    return { ...updated, is_active: Boolean(updated.is_active) };
  });
}

// Like the operator's: taking a charger with upcoming bookings offline needs confirm: true.
async function setChargerStatus(adminId, chargerId, status, { confirm = false } = {}, context = {}) {
  return db.transaction(async (trx) => {
    const charger = await trx('chargers').where({ id: chargerId }).first();
    if (!charger) throw new NotFoundError('Charger not found');
    const station = await trx('stations').where({ id: charger.station_id }).first();
    return changeChargerStatus(trx, { charger, station, status, confirm, context });
  });
}

// --------------------------------------------------------------- bookings

function adminBookings(conn = db) {
  return detailedBookings(conn)
    .innerJoin('users as u', 'u.id', 'b.user_id')
    .select('u.name as driver_name', 'u.email as driver_email');
}

const toAdminBooking = (booking) => ({
  ...booking,
  created_at: toIsoString(booking.created_at),
  updated_at: toIsoString(booking.updated_at),
});

async function listBookings({ status, stationId, date, page, pageSize } = {}) {
  let query = adminBookings();
  if (status) query = query.andWhere('b.status', status);
  if (stationId) query = query.andWhere('b.station_id', stationId);
  if (date) {
    if (!isValidDateString(date)) throw new BadRequestError('date must be a real date in YYYY-MM-DD format');
    const { start, end } = dayBounds(date); // the slot's day in APP_TIMEZONE, not the booking's created_at
    query = query.andWhere('sl.start_time', '>=', start.toISOString()).andWhere('sl.start_time', '<', end.toISOString());
  }
  const result = await paged(query, { page, pageSize }, (rows) =>
    rows.orderBy('b.created_at', 'desc').orderBy('b.id', 'desc')
  );
  return { bookings: result.rows.map(toAdminBooking), total: result.total, page: result.page, pageSize: result.pageSize };
}

async function cancelBooking(adminId, bookingId, reason, context = {}) {
  const why = audit.requireReason(reason, 'cancel a booking');
  return db.transaction(async (trx) => {
    const booking = await trx('bookings').where({ id: bookingId }).first();
    if (!booking) throw new NotFoundError('Booking not found');
    // Conditional on status: a driver cancelling at the same moment isn't overwritten, and
    // there is no second audit entry for something this call didn't do.
    await cancelConfirmed(trx, booking, { context, reason: why });
    return toAdminBooking(await adminBookings(trx).where('b.id', bookingId).first());
  });
}

// ---------------------------------------------------------- slot coverage

// For every charger, how many slots it has on each of the next `days` days (today
// included, in APP_TIMEZONE), counting only slots that haven't started yet. A "gap" is a day with none that a top-up could still fill:
// today doesn't count once the last default slot has already started.
async function getSlotCoverage({ days = 7 } = {}) {
  const today = toZonedDateString(new Date());
  const dates = Array.from({ length: days }, (_, i) => addDaysToDateString(today, i));
  const bounds = dates.map((date) => dayBounds(date));
  const now = Date.now();
  const fillable = dates.map(
    (date) => buildSlotRows(0, date).filter((row) => Date.parse(row.start_time) > now).length > 0
  );

  const windowSlots = db('slots')
    .where('start_time', '>=', bounds[0].start.toISOString())
    .andWhere('start_time', '>', new Date(now).toISOString())
    .andWhere('start_time', '<', bounds[bounds.length - 1].end.toISOString())
    .as('sl');
  const perDayCounts = bounds.map((range, i) =>
    db.raw('SUM(CASE WHEN sl.start_time >= ? AND sl.start_time < ? THEN 1 ELSE 0 END) AS ??', [
      range.start.toISOString(),
      range.end.toISOString(),
      `d${i}`,
    ])
  );

  const rows = await db('chargers as c')
    .innerJoin('stations as s', 's.id', 'c.station_id')
    .leftJoin(windowSlots, 'sl.charger_id', 'c.id')
    .whereNull('c.archived_at')
    .whereNull('s.archived_at')
    .select(
      'c.id as charger_id',
      'c.connector_type',
      'c.power_kw',
      'c.status',
      's.id as station_id',
      's.name as station_name',
      's.is_active as station_active',
      ...perDayCounts
    )
    .groupBy('c.id', 's.id')
    .orderBy('s.id')
    .orderBy('c.id');

  const chargers = rows.map((row) => {
    const perDay = dates.map((date, i) => {
      const slots = Number(row[`d${i}`] || 0);
      return { date, slots, gap: slots === 0 && fillable[i] };
    });
    return {
      chargerId: row.charger_id,
      stationId: row.station_id,
      stationName: row.station_name,
      stationActive: Boolean(row.station_active),
      connectorType: row.connector_type,
      powerKw: row.power_kw,
      status: row.status,
      days: perDay,
      gapDays: perDay.filter((day) => day.gap).length,
    };
  });

  return {
    days,
    dates,
    chargers,
    summary: {
      chargers: chargers.length,
      chargersWithGaps: chargers.filter((charger) => charger.gapDays > 0).length,
      gapDays: chargers.reduce((sum, charger) => sum + charger.gapDays, 0),
    },
  };
}

async function topUpAllSlots(adminId, { days = 7 } = {}, context = {}) {
  const result = await topUpSlots({ days });
  await audit.record(db, {
    action: 'slots.top_up',
    context,
    target: { type: 'chargers', name: 'All chargers' },
    details: { days, chargers: result.chargers, created: result.created },
  });
  return result;
}

// -------------------------------------------------------------- audit log

async function listAuditLog(filters = {}) {
  return audit.listForAdmin(filters);
}

module.exports = {
  getOverview,
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  setUserActive,
  listStations,
  setStationActive,
  reviewStation,
  setChargerStatus,
  listBookings,
  cancelBooking,
  getSlotCoverage,
  topUpAllSlots,
  listAuditLog,
};
