const { buildChargersForStation } = require('../seedData/chargerSpecs');

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
