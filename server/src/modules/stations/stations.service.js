const db = require('../../config/db');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const { haversineDistanceKm } = require('../../utils/geo');

async function attachChargers(stations) {
  if (stations.length === 0) return [];
  const stationIds = stations.map((s) => s.id);
  const chargers = await db('chargers').whereIn('station_id', stationIds).orderBy('id');
  return stations.map((station) => ({
    ...station,
    is_active: Boolean(station.is_active), // 0/1 on SQLite, true/false on Postgres
    chargers: chargers.filter((c) => c.station_id === station.id),
  }));
}

// Deactivated stations (an admin action) are hidden from drivers everywhere; operators
// still get them from listOperatorStations.
// `viewer` is the signed-in user, if any. An operator only ever sees their own stations.
async function listStations(filters = {}, viewer = null) {
  let idsQuery = db('stations as s').distinct('s.id').where('s.is_active', true);
  if (viewer?.role === 'operator') idsQuery = idsQuery.where('s.owner_id', viewer.id);

  const needsChargerJoin =
    filters.status || filters.connectorType || filters.minPrice != null || filters.maxPrice != null;

  if (needsChargerJoin) {
    idsQuery = idsQuery.innerJoin('chargers as c', 'c.station_id', 's.id');
    if (filters.status) idsQuery = idsQuery.where('c.status', filters.status);
    if (filters.connectorType) idsQuery = idsQuery.where('c.connector_type', filters.connectorType);
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
// still open their own station after an admin has deactivated it.
async function getStationDetail(id, viewer = null) {
  const station = await db('stations').where({ id }).first();
  const isOperator = viewer?.role === 'operator';
  const isOwner = isOperator && station?.owner_id === viewer.id;
  if (!station || (isOperator && !isOwner) || (!station.is_active && !isOwner)) {
    throw new NotFoundError('Station not found');
  }

  const chargers = await db('chargers').where({ station_id: id }).orderBy('id');
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
    ...station,
    is_active: Boolean(station.is_active),
    chargers: chargers.map((charger) => ({
      ...charger,
      availableSlotCount: countByCharger[charger.id] || 0,
    })),
  };
}

async function assertOwnsStation(stationId, userId) {
  const station = await db('stations').where({ id: stationId }).first();
  if (!station) throw new NotFoundError('Station not found');
  if (station.owner_id !== userId) throw new ForbiddenError('You do not own this station');
  return station;
}

async function createStation(ownerId, { name, address, lat, lng }) {
  const [station] = await db('stations')
    .insert({ owner_id: ownerId, name, address, lat, lng })
    .returning('*');
  return station;
}

async function updateStation(stationId, ownerId, updates) {
  await assertOwnsStation(stationId, ownerId);
  const [station] = await db('stations')
    .where({ id: stationId })
    .update({ ...updates, updated_at: db.fn.now() })
    .returning('*');
  return station;
}

async function listOperatorStations(ownerId) {
  const stations = await db('stations').where({ owner_id: ownerId }).orderBy('id');
  return attachChargers(stations);
}

module.exports = {
  listStations,
  getStationDetail,
  assertOwnsStation,
  createStation,
  updateStation,
  listOperatorStations,
};
