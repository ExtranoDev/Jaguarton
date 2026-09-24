const db = require('../../config/db');
const { NotFoundError, ConflictError, BadRequestError } = require('../../utils/errors');
const { dayBounds, isValidDateString, toZonedDateString, addDaysToDateString } = require('../../utils/time');
const chargersService = require('../chargers/chargers.service');
const stationsService = require('../stations/stations.service');
const { buildSlotRows } = require('./slotRows');

// Keeps each INSERT under SQLite's bound-parameter limit (4 columns per row).
const INSERT_CHUNK_SIZE = 200;

function requireValidDate(dateStr) {
  if (!isValidDateString(dateStr)) {
    throw new BadRequestError('date must be a real date in YYYY-MM-DD format');
  }
}

async function getSlotsForCharger(chargerId, dateStr, viewer = null) {
  const charger = await db('chargers').where({ id: chargerId }).first();
  if (!charger) throw new NotFoundError('Charger not found');
  const station = await db('stations').where({ id: charger.station_id }).first();
  // An operator can only look at slots on their own chargers.
  if (viewer?.role === 'operator' && station?.owner_id !== viewer.id) throw new NotFoundError('Charger not found');

  // An offline/unavailable charger, or one at a deactivated station or a suspended operator's
  // station, has no bookable slots, regardless of what individual slot rows say.
  if (charger.status !== 'online') return [];
  if (!station || !stationsService.isPubliclyVisible(station, await stationsService.ownerIsActive(db, station))) return [];

  let query = db('slots').where({ charger_id: chargerId });

  if (dateStr) {
    requireValidDate(dateStr);
    const { start, end } = dayBounds(dateStr);
    query = query.andWhere('start_time', '>=', start.toISOString()).andWhere('start_time', '<', end.toISOString());
  } else {
    query = query.andWhere('start_time', '>', new Date().toISOString());
  }

  return query.orderBy('start_time');
}

async function assertOwnsSlot(slotId, userId) {
  const slot = await db('slots').where({ id: slotId }).first();
  if (!slot) throw new NotFoundError('Slot not found');
  await chargersService.assertOwnsCharger(slot.charger_id, userId);
  return slot;
}

// Slots can be created from today up to this many days ahead (in APP_TIMEZONE).
const MAX_GENERATE_DAYS_AHEAD = 90;

async function generateSlots(chargerId, ownerId, { date, startHour, endHour, durationMinutes }) {
  await chargersService.assertOwnsCharger(chargerId, ownerId);
  requireValidDate(date);
  const today = toZonedDateString(new Date());
  const lastDay = addDaysToDateString(today, MAX_GENERATE_DAYS_AHEAD);
  if (date < today || date > lastDay) {
    throw new BadRequestError(`date must be between today (${today}) and ${lastDay}`);
  }

  // Like the top-up, never create a slot that has already started: nobody could book it.
  const now = Date.now();
  const rows = buildSlotRows(chargerId, date, { startHour, endHour, durationMinutes }).filter(
    (row) => Date.parse(row.start_time) > now
  );
  if (rows.length === 0) return [];

  return db('slots').insert(rows).onConflict(['charger_id', 'start_time']).ignore().returning('*');
}

// Makes sure every charger has slots for today and the next `days - 1` days.
// Safe to run repeatedly: existing (charger, start_time) pairs are skipped.
// `ownerId` limits it to that operator's chargers; `stationId` to one station.
async function topUpSlots({
  days = 7,
  startHour,
  endHour,
  durationMinutes,
  ownerId,
  stationId,
} = {}) {
  let chargerQuery = db('chargers as c').innerJoin('stations as s', 's.id', 'c.station_id').select('c.id');
  if (ownerId) chargerQuery = chargerQuery.where('s.owner_id', ownerId);
  if (stationId) chargerQuery = chargerQuery.andWhere('s.id', stationId);
  const chargers = await chargerQuery;

  const today = toZonedDateString(new Date());
  const now = Date.now();
  const rows = [];

  for (const charger of chargers) {
    for (let offset = 0; offset < days; offset += 1) {
      const dateStr = addDaysToDateString(today, offset);
      for (const row of buildSlotRows(charger.id, dateStr, { startHour, endHour, durationMinutes })) {
        if (Date.parse(row.start_time) > now) rows.push(row); // never create slots in the past
      }
    }
  }

  let created = 0;
  await db.transaction(async (trx) => {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      const inserted = await trx('slots')
        .insert(rows.slice(i, i + INSERT_CHUNK_SIZE))
        .onConflict(['charger_id', 'start_time'])
        .ignore()
        .returning('id');
      created += inserted.length;
    }
  });

  return { chargers: chargers.length, days, created };
}

async function topUpSlotsForOperator(ownerId, { days, stationId } = {}) {
  if (stationId) await stationsService.assertOwnsStation(stationId, ownerId);
  return topUpSlots({ days, ownerId, stationId });
}

async function setSlotBlocked(slotId, ownerId, blocked) {
  const slot = await assertOwnsSlot(slotId, ownerId);
  if (slot.status === 'booked') {
    throw new ConflictError('Cannot change a booked slot directly — cancel the booking instead');
  }
  const [updated] = await db('slots')
    .where({ id: slotId })
    .update({ status: blocked ? 'blocked' : 'available', updated_at: db.fn.now() })
    .returning('*');
  return updated;
}

async function deleteSlot(slotId, ownerId) {
  const slot = await assertOwnsSlot(slotId, ownerId);
  if (slot.status !== 'available') {
    throw new ConflictError('Only available (unbooked) slots can be deleted');
  }
  await db('slots').where({ id: slotId }).del();
}

module.exports = {
  getSlotsForCharger,
  generateSlots,
  topUpSlots,
  topUpSlotsForOperator,
  setSlotBlocked,
  deleteSlot,
};
