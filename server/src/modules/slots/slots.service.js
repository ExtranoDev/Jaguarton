const db = require('../../config/db');
const { NotFoundError, ConflictError, BadRequestError } = require('../../utils/errors');
const { dayBounds, isValidDateString, toZonedDateString, addDaysToDateString, toIsoString } = require('../../utils/time');
const chargersService = require('../chargers/chargers.service');
const stationsService = require('../stations/stations.service');
const { buildSlotRows } = require('./slotRows');
const audit = require('../audit/audit.service');

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
  const isOwner = viewer?.role === 'operator' && station?.owner_id === viewer.id;
  if (viewer?.role === 'operator' && !isOwner) throw new NotFoundError('Charger not found');

  // For everyone else, an offline/unavailable or archived charger, or one at a station drivers can't
  // see (deactivated, unapproved, archived, or its operator suspended), has no bookable slots,
  // whatever the slot rows say. The owner always sees their slots, to block and unblock them.
  if (!isOwner) {
    if (charger.status !== 'online' || charger.archived_at != null) return [];
    if (!station || !stationsService.isPubliclyVisible(station, await stationsService.ownerIsActive(db, station))) return [];
  }

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

async function assertOwnsSlot(slotId, userId, conn = db) {
  const slot = await conn('slots').where({ id: slotId }).first();
  if (!slot) throw new NotFoundError('Slot not found');
  const { charger, station } = await chargersService.assertOwnsCharger(slot.charger_id, userId, conn);
  return { slot, charger, station };
}

const slotTarget = (slot, charger, station) => ({
  type: 'slot',
  id: slot.id,
  name: `${toIsoString(slot.start_time)} · Charger #${charger.id} · ${station.name}`,
});

// Slots can be created from today up to this many days ahead (in APP_TIMEZONE).
const MAX_GENERATE_DAYS_AHEAD = 90;

async function generateSlots(chargerId, ownerId, { date, startHour, endHour, durationMinutes }, context = {}) {
  const { charger, station } = await chargersService.assertOwnsCharger(chargerId, ownerId);
  chargersService.assertChargerNotArchived(charger);
  stationsService.assertNotArchived(station);
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

  return db.transaction(async (trx) => {
    const created = await trx('slots').insert(rows).onConflict(['charger_id', 'start_time']).ignore().returning('*');
    await audit.record(trx, {
      action: 'slots.generate',
      context,
      target: audit.chargerTarget(charger, station),
      ...audit.atStation(station),
      details: { date, startHour, endHour, durationMinutes, created: created.length },
    });
    return created;
  });
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
  // Archived chargers and stations get no new slots.
  let chargerQuery = db('chargers as c')
    .innerJoin('stations as s', 's.id', 'c.station_id')
    .whereNull('c.archived_at')
    .whereNull('s.archived_at')
    .select('c.id');
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

async function topUpSlotsForOperator(ownerId, { days, stationId } = {}, context = {}) {
  const station = stationId ? await stationsService.assertOwnsStation(stationId, ownerId) : null;
  const result = await topUpSlots({ days, ownerId, stationId });
  await audit.record(db, {
    action: 'slots.top_up',
    context,
    target: station ? audit.stationTarget(station) : { type: 'stations', name: 'All my stations' },
    stationId: station?.id ?? null,
    ownerId,
    details: { days: result.days, chargers: result.chargers, created: result.created },
  });
  return result;
}

async function setSlotBlocked(slotId, ownerId, blocked, context = {}) {
  return db.transaction(async (trx) => {
    const { slot, charger, station } = await assertOwnsSlot(slotId, ownerId, trx);
    if (slot.status === 'booked') {
      throw new ConflictError('Cannot change a booked slot directly — cancel the booking instead');
    }
    const status = blocked ? 'blocked' : 'available';
    if (slot.status === status) return slot;
    const [updated] = await trx('slots')
      .where({ id: slotId })
      .update({ status, updated_at: trx.fn.now() })
      .returning('*');
    await audit.record(trx, {
      action: blocked ? 'slot.block' : 'slot.unblock',
      context,
      target: slotTarget(slot, charger, station),
      ...audit.atStation(station),
      changes: audit.diff(slot, updated, ['status']),
    });
    return updated;
  });
}

async function deleteSlot(slotId, ownerId, context = {}) {
  await db.transaction(async (trx) => {
    const { slot, charger, station } = await assertOwnsSlot(slotId, ownerId, trx);
    if (slot.status !== 'available') {
      throw new ConflictError('Only available (unbooked) slots can be deleted');
    }
    await trx('slots').where({ id: slotId }).del();
    await audit.record(trx, { action: 'slot.delete', context, target: slotTarget(slot, charger, station), ...audit.atStation(station) });
  });
}

module.exports = {
  getSlotsForCharger,
  generateSlots,
  topUpSlots,
  topUpSlotsForOperator,
  setSlotBlocked,
  deleteSlot,
};
