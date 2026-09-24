const db = require('../../config/db');
const { NotFoundError } = require('../../utils/errors');
const stationsService = require('../stations/stations.service');
const audit = require('../audit/audit.service');

const CHARGER_FIELDS = ['connector_type', 'power_kw', 'price_per_kwh', 'status'];

// Returns the charger and its station (the station is needed for audit entries).
async function assertOwnsCharger(chargerId, userId, conn = db) {
  const charger = await conn('chargers').where({ id: chargerId }).first();
  if (!charger) throw new NotFoundError('Charger not found');
  const station = await stationsService.assertOwnsStation(charger.station_id, userId, conn);
  return { charger, station };
}

async function createCharger(stationId, ownerId, { connectorType, powerKw, pricePerKwh, status }, context = {}) {
  return db.transaction(async (trx) => {
    const station = await stationsService.assertOwnsStation(stationId, ownerId, trx);
    const [charger] = await trx('chargers')
      .insert({
        station_id: stationId,
        connector_type: connectorType,
        power_kw: powerKw,
        price_per_kwh: pricePerKwh,
        status: status || 'online',
      })
      .returning('*');
    await audit.record(trx, {
      action: 'charger.create',
      context,
      target: audit.chargerTarget(charger, station),
      ...audit.atStation(station),
      changes: audit.diff({}, charger, CHARGER_FIELDS),
    });
    return charger;
  });
}

async function updateCharger(chargerId, ownerId, { connectorType, powerKw, pricePerKwh, status }, context = {}) {
  return db.transaction(async (trx) => {
    const { charger: before, station } = await assertOwnsCharger(chargerId, ownerId, trx);
    const [charger] = await trx('chargers')
      .where({ id: chargerId })
      .update({
        connector_type: connectorType,
        power_kw: powerKw,
        price_per_kwh: pricePerKwh,
        status,
        updated_at: trx.fn.now(),
      })
      .returning('*');
    const changes = audit.diff(before, charger, CHARGER_FIELDS);
    if (changes) {
      await audit.record(trx, { action: 'charger.update', context, target: audit.chargerTarget(charger, station), ...audit.atStation(station), changes });
    }
    return charger;
  });
}

async function updateChargerStatus(chargerId, ownerId, status, context = {}) {
  return db.transaction(async (trx) => {
    const { charger: before, station } = await assertOwnsCharger(chargerId, ownerId, trx);
    if (before.status === status) return before;
    const [charger] = await trx('chargers')
      .where({ id: chargerId })
      .update({ status, updated_at: trx.fn.now() })
      .returning('*');
    await audit.record(trx, {
      action: 'charger.status',
      context,
      target: audit.chargerTarget(charger, station),
      ...audit.atStation(station),
      changes: audit.diff(before, charger, ['status']),
    });
    return charger;
  });
}

module.exports = { createCharger, updateCharger, updateChargerStatus, assertOwnsCharger };
