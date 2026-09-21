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
const { detailedBookings } = require('../bookings/bookings.service');
const { topUpSlots } = require('../slots/slots.service');
const { buildSlotRows } = require('../slots/slotRows');

const LIST_LIMIT = 200;
const UTILISATION_DAYS = 7;

// Every state-changing admin action goes through here, on the same connection/transaction
// as the change itself so an action and its audit entry succeed or fail together.
// `target` is "<type>:<id>"; listAuditLog resolves it to a readable label.
async function recordAction(conn, adminId, action, target, reason = null) {
  await conn('admin_actions').insert({
    admin_id: adminId,
    action,
    target,
    reason,
    created_at: new Date().toISOString(),
  });
}

const count = (row) => Number(row?.n || 0);

// ---------------------------------------------------------------- overview

async function getOverview() {
  const [userRows, stationRows, chargerRows, bookingRows, upcomingRow, utilisation] = await Promise.all([
    db('users').select('role', 'is_active').count('* as n').groupBy('role', 'is_active'),
    db('stations').select('is_active').count('* as n').groupBy('is_active'),
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
    stations: { total: stationsTotal, active: stationsActive, inactive: stationsTotal - stationsActive },
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
// booked. Capacity = booked slots + available slots on an online charger at an active
// station; blocked slots and slots nobody could book don't count against it.
// Grouping by start time (not by slot) keeps this small however many chargers exist.
async function getUtilisation() {
  const today = toZonedDateString(new Date());
  const dates = Array.from({ length: UTILISATION_DAYS }, (_, i) => addDaysToDateString(today, i));
  const windowStart = dayBounds(dates[0]).start;
  const windowEnd = dayBounds(dates[dates.length - 1]).end;

  const bookable = "CASE WHEN c.status = 'online' AND s.is_active THEN 1 ELSE 0 END";
  const rows = await db('slots as sl')
    .innerJoin('chargers as c', 'c.id', 'sl.charger_id')
    .innerJoin('stations as s', 's.id', 'c.station_id')
    .where('sl.start_time', '>=', windowStart.toISOString())
    .andWhere('sl.start_time', '<', windowEnd.toISOString())
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

async function listUsers({ role, q } = {}) {
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
  const users = await query.orderBy('id').limit(LIST_LIMIT);
  return users.map(toAdminUser);
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

async function createUser(adminId, { name, email, role, password }) {
  const passwordHash = await hashPassword(password); // slow by design, so not inside the transaction
  return db.transaction(async (trx) => {
    if (await trx('users').where({ email }).first()) {
      throw new ConflictError('An account with this email already exists');
    }
    try {
      const [user] = await trx('users').insert({ name, email, role, password_hash: passwordHash }).returning('*');
      await recordAction(trx, adminId, 'user.create', `user:${user.id}`, `Created as ${role}`);
      return toAdminUser(user);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('An account with this email already exists');
      throw err;
    }
  });
}

async function updateUser(adminId, userId, { name, email, role }) {
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
      const [updated] = await trx('users')
        .where({ id: userId })
        .update({ ...changes, updated_at: trx.fn.now() })
        .returning('*');
      const summary = Object.keys(changes)
        .map((field) => (field === 'role' ? `role ${target.role} → ${role}` : `${field} changed`))
        .join('; ');
      await recordAction(trx, adminId, 'user.update', `user:${userId}`, summary);
      return toAdminUser(updated);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('An account with this email already exists');
      throw err;
    }
  });
}

// Sets a new password, either the one the admin typed or a generated temporary one. The
// temporary password is returned once and never stored in readable form; the audit log records
// only that a reset happened. (Sessions the user already has stay valid until they expire.)
async function resetUserPassword(adminId, userId, { password } = {}) {
  if (userId === adminId) {
    throw new BadRequestError('Use your account settings to change your own password');
  }
  const temporaryPassword = password ? undefined : generateTemporaryPassword();
  const passwordHash = await hashPassword(password || temporaryPassword);

  return db.transaction(async (trx) => {
    const target = await trx('users').where({ id: userId }).first();
    if (!target) throw new NotFoundError('User not found');
    await trx('users').where({ id: userId }).update({ password_hash: passwordHash, updated_at: trx.fn.now() });
    await recordAction(
      trx,
      adminId,
      'user.reset_password',
      `user:${userId}`,
      temporaryPassword ? 'Temporary password generated' : 'Password set by an admin'
    );
    return { user: toAdminUser(target), temporaryPassword };
  });
}

async function setUserActive(adminId, userId, isActive) {
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
    await recordAction(trx, adminId, isActive ? 'user.reactivate' : 'user.suspend', `user:${userId}`);
    return toAdminUser(updated);
  });
}

// ---------------------------------------------------------------- stations

async function listStations() {
  const [stations, chargers] = await Promise.all([
    db('stations as s')
      .innerJoin('users as u', 'u.id', 's.owner_id')
      .select(
        's.id',
        's.name',
        's.address',
        's.lat',
        's.lng',
        's.is_active',
        's.owner_id',
        'u.name as owner_name',
        'u.email as owner_email'
      )
      .orderBy('s.id'),
    db('chargers').orderBy('id'),
  ]);

  return stations.map((station) => ({
    ...station,
    is_active: Boolean(station.is_active),
    chargers: chargers.filter((charger) => charger.station_id === station.id),
  }));
}

async function setStationActive(adminId, stationId, isActive) {
  return db.transaction(async (trx) => {
    const station = await trx('stations').where({ id: stationId }).first();
    if (!station) throw new NotFoundError('Station not found');
    if (Boolean(station.is_active) === isActive) return { ...station, is_active: isActive };

    const [updated] = await trx('stations')
      .where({ id: stationId })
      .update({ is_active: isActive, updated_at: trx.fn.now() })
      .returning('*');
    await recordAction(trx, adminId, isActive ? 'station.activate' : 'station.deactivate', `station:${stationId}`);
    return { ...updated, is_active: Boolean(updated.is_active) };
  });
}

async function setChargerStatus(adminId, chargerId, status) {
  return db.transaction(async (trx) => {
    const charger = await trx('chargers').where({ id: chargerId }).first();
    if (!charger) throw new NotFoundError('Charger not found');
    if (charger.status === status) return charger;

    const [updated] = await trx('chargers')
      .where({ id: chargerId })
      .update({ status, updated_at: trx.fn.now() })
      .returning('*');
    await recordAction(trx, adminId, `charger.set_${status}`, `charger:${chargerId}`);
    return updated;
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

async function listBookings({ status, stationId, date } = {}) {
  let query = adminBookings();
  if (status) query = query.andWhere('b.status', status);
  if (stationId) query = query.andWhere('b.station_id', stationId);
  if (date) {
    if (!isValidDateString(date)) throw new BadRequestError('date must be a real date in YYYY-MM-DD format');
    const { start, end } = dayBounds(date); // the slot's day in APP_TIMEZONE, not the booking's created_at
    query = query.andWhere('sl.start_time', '>=', start.toISOString()).andWhere('sl.start_time', '<', end.toISOString());
  }
  const bookings = await query.orderBy('b.created_at', 'desc').orderBy('b.id', 'desc').limit(LIST_LIMIT);
  return bookings.map(toAdminBooking);
}

async function cancelBooking(adminId, bookingId, reason) {
  return db.transaction(async (trx) => {
    const booking = await trx('bookings').where({ id: bookingId }).first();
    if (!booking) throw new NotFoundError('Booking not found');

    // Conditional on status so a driver cancelling at the same moment doesn't get
    // overwritten (or produce a second audit entry for something we didn't do).
    const cancelled = await trx('bookings')
      .where({ id: bookingId, status: 'confirmed' })
      .update({ status: 'cancelled', updated_at: trx.fn.now() });

    if (cancelled > 0) {
      await trx('slots').where({ id: booking.slot_id }).update({ status: 'available', updated_at: trx.fn.now() });
      await recordAction(trx, adminId, 'booking.cancel', `booking:${bookingId}`, reason);
    }

    return toAdminBooking(await adminBookings(trx).where('b.id', bookingId).first());
  });
}

// ---------------------------------------------------------- slot coverage

// For every charger, how many slots it has on each of the next `days` days (today
// included, in APP_TIMEZONE). A "gap" is a day with none that a top-up could still fill:
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

async function topUpAllSlots(adminId, { days = 7 } = {}) {
  const result = await topUpSlots({ days });
  await recordAction(db, adminId, 'slots.top_up', 'chargers:all', `Next ${days} days: ${result.created} new slots`);
  return result;
}

// -------------------------------------------------------------- audit log

const TARGET_LABELS = {
  user: async (ids) =>
    (await db('users').whereIn('id', ids).select('id', 'name', 'email')).map((r) => [r.id, `${r.name} (${r.email})`]),
  station: async (ids) => (await db('stations').whereIn('id', ids).select('id', 'name')).map((r) => [r.id, r.name]),
  charger: async (ids) =>
    (
      await db('chargers as c')
        .innerJoin('stations as s', 's.id', 'c.station_id')
        .whereIn('c.id', ids)
        .select('c.id', 's.name as station_name')
    ).map((r) => [r.id, `Charger #${r.id} · ${r.station_name}`]),
  booking: async (ids) =>
    (await db('bookings').whereIn('id', ids).select('id', 'booking_reference')).map((r) => [r.id, r.booking_reference]),
};

async function resolveTargetLabels(targets) {
  const idsByType = {};
  for (const target of new Set(targets)) {
    const [type, rawId] = target.split(':');
    const id = Number(rawId);
    if (TARGET_LABELS[type] && Number.isInteger(id)) (idsByType[type] ||= []).push(id);
  }

  const labels = new Map([['chargers:all', 'All chargers']]);
  await Promise.all(
    Object.entries(idsByType).map(async ([type, ids]) => {
      for (const [id, label] of await TARGET_LABELS[type](ids)) labels.set(`${type}:${id}`, label);
    })
  );
  return labels;
}

async function listAuditLog({ limit = 100 } = {}) {
  const rows = await db('admin_actions as a')
    .innerJoin('users as u', 'u.id', 'a.admin_id')
    .select('a.id', 'a.admin_id', 'a.action', 'a.target', 'a.reason', 'a.created_at', 'u.name as admin_name', 'u.email as admin_email')
    .orderBy('a.created_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(limit);

  const labels = await resolveTargetLabels(rows.map((row) => row.target));
  return rows.map((row) => ({
    ...row,
    created_at: toIsoString(row.created_at),
    target_label: labels.get(row.target) || null,
  }));
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
  setChargerStatus,
  listBookings,
  cancelBooking,
  getSlotCoverage,
  topUpAllSlots,
  listAuditLog,
};
