const CONNECTOR_TYPES = ['Type2_AC', 'CCS2_DC', 'CHAdeMO_DC'];

// Deterministic-but-varied charger specs per (station index, charger slot)
// so the demo dataset always looks the same across reseeds.
function buildChargersForStation(stationIndex, stationId) {
  const chargerCount = 2 + (stationIndex % 2); // 2 or 3 chargers per station
  const chargers = [];

  for (let i = 0; i < chargerCount; i += 1) {
    const connectorType = CONNECTOR_TYPES[(stationIndex + i) % CONNECTOR_TYPES.length];
    const isDc = connectorType !== 'Type2_AC';
    const powerKw = isDc ? [50, 100, 150][i % 3] : 22;
    const pricePerKwh = isDc ? 220 + (i * 15) : 150 + (i * 10);

    // Sprinkle a few offline/unavailable chargers across the dataset for
    // demo variety, most stay online.
    const slotIndexGlobal = stationIndex * 3 + i;
    let status = 'online';
    if (slotIndexGlobal % 11 === 0) status = 'offline';
    else if (slotIndexGlobal % 17 === 0) status = 'unavailable';

    chargers.push({
      station_id: stationId,
      connector_type: connectorType,
      power_kw: powerKw,
      price_per_kwh: pricePerKwh,
      status,
    });
  }

  return chargers;
}

exports.seed = async function seed(knex) {
  const stations = await knex('stations').select('id').orderBy('id');
  if (stations.length === 0) {
    throw new Error('No stations found — run 02_stations_lagos seed first');
  }

  const allChargers = stations.flatMap((station, index) =>
    buildChargersForStation(index, station.id)
  );

  await knex('chargers').insert(allChargers);
};
