const db = require('../../config/db');
const { NotFoundError } = require('../../utils/errors');
const stationsService = require('../stations/stations.service');

async function assertOwnsCharger(chargerId, userId) {
  const charger = await db('chargers').where({ id: chargerId }).first();
  if (!charger) throw new NotFoundError('Charger not found');
  await stationsService.assertOwnsStation(charger.station_id, userId);
  return charger;
}

async function createCharger(stationId, ownerId, { connectorType, powerKw, pricePerKwh, status }) {
  await stationsService.assertOwnsStation(stationId, ownerId);
  const [charger] = await db('chargers')
    .insert({
      station_id: stationId,
      connector_type: connectorType,
      power_kw: powerKw,
      price_per_kwh: pricePerKwh,
      status: status || 'online',
    })
    .returning('*');
  return charger;
}

async function updateCharger(chargerId, ownerId, { connectorType, powerKw, pricePerKwh, status }) {
  await assertOwnsCharger(chargerId, ownerId);
  const [charger] = await db('chargers')
    .where({ id: chargerId })
    .update({
      connector_type: connectorType,
      power_kw: powerKw,
      price_per_kwh: pricePerKwh,
      status,
      updated_at: db.fn.now(),
    })
    .returning('*');
  return charger;
}

async function updateChargerStatus(chargerId, ownerId, status) {
  await assertOwnsCharger(chargerId, ownerId);
  const [charger] = await db('chargers')
    .where({ id: chargerId })
    .update({ status, updated_at: db.fn.now() })
    .returning('*');
  return charger;
}

module.exports = { createCharger, updateCharger, updateChargerStatus, assertOwnsCharger };
