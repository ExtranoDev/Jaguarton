const db = require('../../config/db');
const { NotFoundError, ForbiddenError, ConflictError } = require('../../utils/errors');
const { haversineDistanceKm } = require('../../utils/geo');
const { toIsoString } = require('../../utils/time');
const audit = require('../audit/audit.service');
const { countUpcomingBookings } = require('../bookings/upcoming');

// 0/1 on SQLite, true/false on Postgres; timestamps as ISO strings; `archived` for convenience.
const toStation = (station) => ({
  ...station,
  is_active: Boolean(station.is_active),
  archived_at: toIsoString(station.archived_at),
  archived: station.archived_at != null,
});
const toCharger = (charger) => ({ ...charger, archived_at: toIsoString(charger.archived_at), archived: charger.archived_at != null });

// Archived chargers are left out of public views; the owner sees them (flagged) to restore them.
async function attachChargers(stations, { includeArchived = false } = {}) {
  if (stations.length === 0) return [];
  const stationIds = stations.map((s) => s.id);
  let query = db('chargers').whereIn('station_id', stationIds).orderBy('id');
  if (!includeArchived) query = query.whereNull('archived_at');
  const chargers = await query;
  return stations.map((station) => ({
    ...toStation(station),
    chargers: chargers.filter((c) => c.station_id === station.id).map(toCharger),
  }));
}

// Whether drivers can see and book a station: it is active (not deactivated by an admin), approved,
// not archived, and its operator isn't suspended. `ownerActive` is the owner's users.is_active.
const isPubliclyVisible = (station, ownerActive) =>
  Boolean(station.is_active) &&
  (station.approval_status ?? 'approved') === 'approved' &&
  station.archived_at == null &&
  Boolean(ownerActive);

async function ownerIsActive(conn, station) {
  const owner = await conn('users').where({ id: station.owner_id }).select('is_active').first();
  return Boolean(owner?.is_active);
}

// The same rule as isPubliclyVisible, as query conditions on `s` (stations) and `owner` (users).
function wherePublic(query) {
  return query
    .where('s.is_active', true)
    .andWhere('s.approval_status', 'approved')
    .whereNull('s.archived_at')
    .andWhere('owner.is_active', true);
}

// Deactivated, unapproved and archived stations, and every station of a suspended operator, are
// hidden from drivers everywhere; operators still get their own from listOperatorStations.
// `viewer` is the signed-in user, if any. An operator only ever sees their own stations.
async function listStations(filters = {}, viewer = null) {
  let idsQuery = wherePublic(db('stations as s').distinct('s.id').innerJoin('users as owner', 'owner.id', 's.owner_id'));
  if (viewer?.role === 'operator') idsQuery = idsQuery.where('s.owner_id', viewer.id);

  const needsChargerJoin =
    filters.status || filters.connectorTypes?.length || filters.minPrice != null || filters.maxPrice != null;

  if (needsChargerJoin) {
    idsQuery = idsQuery.innerJoin('chargers as c', 'c.station_id', 's.id').whereNull('c.archived_at');
    if (filters.status) idsQuery = idsQuery.where('c.status', filters.status);
    // Every charger condition applies to the same charger: "online" and "CCS2" means an online CCS2.
    if (filters.connectorTypes?.length) idsQuery = idsQuery.whereIn('c.connector_type', filters.connectorTypes);
    if (filters.minPrice != null) idsQuery = idsQuery.where('c.price_per_kwh', '>=', filters.minPrice);
    if (filters.maxPrice != null) idsQuery = idsQuery.where('c.price_per_kwh', '<=', filters.maxPrice);
  }

  const idRows = await idsQuery;
  const ids = idRows.map((r) => r.id);
  if (ids.length === 0) return [];

  const stations = await db('stations').whereIn('id', ids).orderBy('id');
  let result = await attachChargers(stations);

  if (filters.lat != null && filters.lng != null) {
    result = result.map((station) => ({
      ...station,
      distanceKm: Number(
        haversineDistanceKm(filters.lat, filters.lng, station.lat, station.lng).toFixed(2)
      ),
    }));
    if (filters.radiusKm != null) {
      result = result.filter((station) => station.distanceKm <= filters.radiusKm);
    }
    result.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  return result;
}

// Another operator's station is a 404 (not a 403), so its existence isn't revealed. An owner can
// still open their own station while it is pending, rejected, archived or deactivated.
async function getStationDetail(id, viewer = null) {
  const station = await db('stations').where({ id }).first();
  const isOperator = viewer?.role === 'operator';
  const isOwner = isOperator && station?.owner_id === viewer.id;
  if (!station || (isOperator && !isOwner)) throw new NotFoundError('Station not found');
  if (!isOwner && !isPubliclyVisible(station, await ownerIsActive(db, station))) {
    throw new NotFoundError('Station not found');
  }

  let chargerQuery = db('chargers').where({ station_id: id }).orderBy('id');
  if (!isOwner) chargerQuery = chargerQuery.whereNull('archived_at');
  const chargers = await chargerQuery;
  const chargerIds = chargers.map((c) => c.id);

  const availabilityCounts = chargerIds.length
    ? await db('slots')
        .whereIn('charger_id', chargerIds)
        .andWhere('status', 'available')
        .andWhere('start_time', '>', new Date().toISOString())
        .groupBy('charger_id')
        .select('charger_id')
        .count('id as count')
    : [];

  const countByCharger = Object.fromEntries(
    availabilityCounts.map((row) => [row.charger_id, Number(row.count)])
  );

  return {
    ...toStation(station),
    chargers: chargers.map((charger) => ({
      ...toCharger(charger),
      availableSlotCount: countByCharger[charger.id] || 0,
    })),
  };
}

async function assertOwnsStation(stationId, userId, conn = db) {
  const station = await conn('stations').where({ id: stationId }).first();
  if (!station) throw new NotFoundError('Station not found');
  if (station.owner_id !== userId) throw new ForbiddenError('You do not own this station');
  return station;
}

// For changes that make no sense on an archived station (restore it first).
function assertNotArchived(station) {
  if (station.archived_at != null) {
    throw new ConflictError('This station is archived. Restore it before changing it');
  }
}

const STATION_FIELDS = ['name', 'address', 'lat', 'lng'];

// New stations wait for an admin's approval before drivers can see them.
async function createStation(ownerId, { name, address, lat, lng }, context = {}) {
  return db.transaction(async (trx) => {
    const [station] = await trx('stations')
      .insert({ owner_id: ownerId, name, address, lat, lng, approval_status: 'pending' })
      .returning('*');
    await audit.record(trx, {
      action: 'station.create',
      context,
      target: audit.stationTarget(station),
      ...audit.atStation(station),
      changes: audit.diff({}, station, [...STATION_FIELDS, 'approval_status']),
    });
    return toStation(station);
  });
}

// Editing a rejected station resubmits it: it goes back to pending for an admin to look at again.
// An approved station stays approved.
async function updateStation(stationId, ownerId, updates, context = {}) {
  return db.transaction(async (trx) => {
    const before = await assertOwnsStation(stationId, ownerId, trx);
    assertNotArchived(before);
    const resubmit = before.approval_status === 'rejected' ? { approval_status: 'pending', review_note: null } : {};
    const [station] = await trx('stations')
      .where({ id: stationId })
      .update({ ...updates, ...resubmit, updated_at: trx.fn.now() })
      .returning('*');
    const changes = audit.diff(before, station, [...STATION_FIELDS, 'approval_status']);
    if (changes) {
      await audit.record(trx, { action: 'station.update', context, target: audit.stationTarget(station), ...audit.atStation(station), changes });
    }
    return toStation(station);
  });
}

// Archiving hides a station from drivers and stops bookings, keeping everything about it. People
// already booked would be stranded, so the operator must cancel those bookings first.
async function setStationArchived(stationId, ownerId, archived, context = {}) {
  return db.transaction(async (trx) => {
    const station = await assertOwnsStation(stationId, ownerId, trx);
    if ((station.archived_at != null) === archived) return toStation(station);
    if (archived) {
      const upcoming = await countUpcomingBookings(trx, { stationId });
      if (upcoming > 0) {
        throw new ConflictError(
          `This station has ${upcoming} upcoming booking${upcoming === 1 ? '' : 's'}. Cancel ${upcoming === 1 ? 'it' : 'them'} before archiving the station`,
          { code: 'HAS_UPCOMING_BOOKINGS', upcomingBookings: upcoming }
        );
      }
    }
    const [updated] = await trx('stations')
      .where({ id: stationId })
      .update({ archived_at: archived ? new Date().toISOString() : null, updated_at: trx.fn.now() })
      .returning('*');
    await audit.record(trx, {
      action: archived ? 'station.archive' : 'station.unarchive',
      context,
      target: audit.stationTarget(updated),
      ...audit.atStation(updated),
      changes: { archived: { from: !archived, to: archived } },
    });
    return toStation(updated);
  });
}

async function listOperatorStations(ownerId) {
  const stations = await db('stations').where({ owner_id: ownerId }).orderBy('id');
  return attachChargers(stations, { includeArchived: true });
}

module.exports = {
  isPubliclyVisible,
  ownerIsActive,
  wherePublic,
  toStation,
  toCharger,
  listStations,
  getStationDetail,
  assertOwnsStation,
  assertNotArchived,
  createStation,
  updateStation,
  setStationArchived,
  listOperatorStations,
};
