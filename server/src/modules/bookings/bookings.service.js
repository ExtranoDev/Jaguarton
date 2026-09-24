const db = require('../../config/db');
const { NotFoundError, ConflictError, ForbiddenError } = require('../../utils/errors');
const { isUniqueViolation } = require('../../utils/dbErrors');
const { generateBookingReference } = require('../../utils/bookingReference');
const { toIsoString } = require('../../utils/time');
const { isPubliclyVisible, ownerIsActive } = require('../stations/stations.service');
const audit = require('../audit/audit.service');

// Booking rows joined with the slot time, charger and station info that the
// driver-facing screens need (the raw row only has foreign keys).
function detailedBookings(conn = db) {
  return conn('bookings as b')
    .innerJoin('slots as sl', 'sl.id', 'b.slot_id')
    .innerJoin('chargers as c', 'c.id', 'b.charger_id')
    .innerJoin('stations as s', 's.id', 'b.station_id')
    .select(
      'b.*',
      'sl.start_time',
      'sl.end_time',
      'c.connector_type',
      'c.power_kw',
      's.name as station_name',
      's.address as station_address'
    );
}

// Concurrency-safe booking creation. Three independent layers guard against
// two drivers booking the same slot at the same time:
//   1. SELECT ... FOR UPDATE inside a transaction (row lock; no-ops on SQLite,
//      which is single-writer anyway, so layers 2-3 still hold there).
//   2. An atomic conditional UPDATE (`WHERE status = 'available'`) is the
//      real gate — if it affects 0 rows, another request already won.
//   3. A partial unique index on bookings(slot_id) WHERE status='confirmed'
//      is a DB-level backstop independent of this code path.
// The driver's own row is locked first too, so two bookings by one driver at once are checked for
// overlap one after the other rather than both passing.
async function createBooking({ slotId, userId }, context = {}) {
  return db.transaction(async (trx) => {
    await trx('users').where({ id: userId }).forUpdate().first();
    const slot = await trx('slots').where({ id: slotId }).forUpdate().first();
    if (!slot) throw new NotFoundError('Slot not found');

    const charger = await trx('chargers').where({ id: slot.charger_id }).first();
    if (!charger) throw new NotFoundError('Charger not found');
    const station = await trx('stations').where({ id: charger.station_id }).first();
    if (!station || !isPubliclyVisible(station, await ownerIsActive(trx, station))) {
      throw new ConflictError('This station is not currently available for booking');
    }
    if (charger.status !== 'online' || charger.archived_at != null) {
      throw new ConflictError('This charger is not currently available for booking');
    }
    if (Date.parse(toIsoString(slot.start_time)) <= Date.now()) {
      throw new ConflictError('This slot has already started and can no longer be booked');
    }
    if (slot.status !== 'available') {
      throw new ConflictError('This slot is no longer available');
    }

    // One car can't charge in two places at once.
    const clash = await trx('bookings as b')
      .innerJoin('slots as sl', 'sl.id', 'b.slot_id')
      .where('b.user_id', userId)
      .andWhere('b.status', 'confirmed')
      .andWhere('sl.start_time', '<', slot.end_time)
      .andWhere('sl.end_time', '>', slot.start_time)
      .select('b.booking_reference')
      .first();
    if (clash) {
      throw new ConflictError(`You already have a booking at this time (${clash.booking_reference})`);
    }

    const affectedRows = await trx('slots')
      .where({ id: slotId, status: 'available' })
      .update({ status: 'booked', updated_at: trx.fn.now() });

    if (affectedRows === 0) {
      throw new ConflictError('This slot is no longer available');
    }

    try {
      const [booking] = await trx('bookings')
        .insert({
          slot_id: slotId,
          user_id: userId,
          charger_id: slot.charger_id,
          station_id: charger.station_id,
          booking_reference: generateBookingReference(),
          price_at_booking: charger.price_per_kwh,
          status: 'confirmed',
        })
        .returning('*');
      const driver = await trx('users').where({ id: userId }).select('email').first();
      await audit.record(trx, {
        action: 'booking.create',
        context,
        target: audit.bookingTarget(booking, driver?.email),
        ...audit.atStation(station),
        details: { slotId, chargerId: charger.id, startTime: toIsoString(slot.start_time), price: charger.price_per_kwh },
      });
      return await detailedBookings(trx).where('b.id', booking.id).first();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('This slot is no longer available');
      }
      throw err;
    }
  });
}

// Cancels a confirmed booking, frees its slot and logs who did it. Conditional on the status, so
// two people cancelling at once can't both succeed (or write two audit entries). Returns whether
// this call did the cancelling. Shared by drivers, operators and admins.
async function cancelConfirmed(trx, booking, { context = {}, reason = null } = {}) {
  const cancelled = await trx('bookings')
    .where({ id: booking.id, status: 'confirmed' })
    .update({ status: 'cancelled', updated_at: trx.fn.now() });
  if (cancelled === 0) return false;

  await trx('slots').where({ id: booking.slot_id }).update({ status: 'available', updated_at: trx.fn.now() });
  const [station, driver, slot] = await Promise.all([
    trx('stations').where({ id: booking.station_id }).first(),
    trx('users').where({ id: booking.user_id }).select('email').first(),
    trx('slots').where({ id: booking.slot_id }).select('start_time').first(),
  ]);
  await audit.record(trx, {
    action: 'booking.cancel',
    context,
    target: audit.bookingTarget(booking, driver?.email),
    stationId: booking.station_id,
    ownerId: station?.owner_id ?? null,
    reason,
    changes: { status: { from: 'confirmed', to: 'cancelled' } },
    details: { startTime: toIsoString(slot?.start_time) },
  });
  return true;
}

async function cancelBooking(bookingId, userId, context = {}) {
  return db.transaction(async (trx) => {
    const booking = await trx('bookings').where({ id: bookingId }).first();
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.user_id !== userId) throw new ForbiddenError('You do not own this booking');
    await cancelConfirmed(trx, booking, { context });
    return trx('bookings').where({ id: bookingId }).first();
  });
}

// An operator cancelling a booking at one of their stations, with a reason the driver's booking
// history and the audit log keep. Only bookings that haven't started can be cancelled.
async function cancelBookingAsOperator(bookingId, ownerId, reason, context = {}) {
  const why = audit.requireReason(reason, 'cancel a booking');
  return db.transaction(async (trx) => {
    const booking = await trx('bookings').where({ id: bookingId }).first();
    const station = booking && (await trx('stations').where({ id: booking.station_id }).first());
    // Someone else's booking is a 404, like someone else's station.
    if (!booking || station?.owner_id !== ownerId) throw new NotFoundError('Booking not found');
    if (booking.status === 'confirmed') {
      const slot = await trx('slots').where({ id: booking.slot_id }).first();
      if (Date.parse(toIsoString(slot.start_time)) <= Date.now()) {
        throw new ConflictError('This booking has already started and can no longer be cancelled');
      }
    }
    await cancelConfirmed(trx, booking, { context, reason: why });
    return detailedBookings(trx).where('b.id', bookingId).first();
  });
}

async function getBookingById(bookingId, requester) {
  const booking = await detailedBookings().where('b.id', bookingId).first();
  if (!booking) throw new NotFoundError('Booking not found');

  if (booking.user_id === requester.id) return booking;

  if (requester.role === 'operator') {
    const station = await db('stations').where({ id: booking.station_id }).first();
    if (station && station.owner_id === requester.id) return booking;
  }

  throw new ForbiddenError('You do not have access to this booking');
}

async function listMyBookings(userId) {
  return detailedBookings().where('b.user_id', userId).orderBy('b.created_at', 'desc').orderBy('b.id', 'desc');
}

async function listOperatorBookings(ownerId, filters = {}) {
  let query = detailedBookings()
    .innerJoin('users as u', 'u.id', 'b.user_id')
    .select('u.name as driver_name', 'u.email as driver_email')
    .where('s.owner_id', ownerId);

  if (filters.stationId) query = query.andWhere('b.station_id', filters.stationId);
  if (filters.chargerId) query = query.andWhere('b.charger_id', filters.chargerId);
  if (filters.status) query = query.andWhere('b.status', filters.status);

  return query.orderBy('b.created_at', 'desc').orderBy('b.id', 'desc');
}

module.exports = {
  createBooking,
  cancelBooking,
  cancelConfirmed,
  cancelBookingAsOperator,
  getBookingById,
  listMyBookings,
  listOperatorBookings,
  detailedBookings,
};
