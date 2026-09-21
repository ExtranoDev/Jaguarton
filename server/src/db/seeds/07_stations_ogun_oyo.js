const bcrypt = require('bcryptjs');
const { buildSlotRows } = require('../../modules/slots/slotRows');
const { toZonedDateString, addDaysToDateString } = require('../../utils/time');
const { buildChargersForStation } = require('../seedData/chargerSpecs');
const { REGIONS, REGION_STATIONS, REGION_INDEX_OFFSET } = require('../seedData/regionStations');

const DAYS_AHEAD = 7;
const INSERT_CHUNK_SIZE = 200;

// The operator account for a state: reused if it exists, created (as an operator) if not.
async function ensureOperator(knex, { name, email }) {
  const existing = await knex('users').where({ email }).first();
  if (existing) {
    if (existing.role !== 'operator') throw new Error(`${email} exists but is a ${existing.role}, not an operator`);
    return existing;
  }
  // Never fall back to the well-known demo password on a real deployment.
  if (!process.env.SEED_PASSWORD && process.env.NODE_ENV === 'production') {
    throw new Error(`Set SEED_PASSWORD before seeding: this creates the operator account ${email}`);
  }
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD || 'password123', 10);
  const [operator] = await knex('users').insert({ name, email, password_hash: passwordHash, role: 'operator' }).returning('*');
  return operator;
}

// Adds the Ogun and Oyo stations with their chargers and 7 days of slots, each state owned by its
// own operator. Unlike the other seeds this never deletes anything: a station whose name already
// exists is skipped, so it is safe to run on a database that holds real bookings.
//   full seed:                 runs last, after 01-06
//   existing database (Neon):  npm run seed:regions
exports.seed = async function seed(knex) {
  const today = toZonedDateString(new Date());
  const now = Date.now();
  let position = 0;
  let added = 0;

  for (const { operator, stations } of REGIONS) {
    const owner = await ensureOperator(knex, operator);

    for (const station of stations) {
      const index = position;
      position += 1;
      if (await knex('stations').where({ name: station.name }).first()) continue;

      // One transaction per station, so a failure can't leave a station without chargers or slots
      // (which a re-run would then skip because the name already exists).
      await knex.transaction(async (trx) => {
        const [{ id: stationId }] = await trx('stations').insert({ ...station, owner_id: owner.id }).returning('id');
        const chargerRows = buildChargersForStation(REGION_INDEX_OFFSET + index, stationId);
        const chargers = await trx('chargers').insert(chargerRows).returning('id');

        const slotRows = [];
        for (const { id: chargerId } of chargers) {
          for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
            for (const row of buildSlotRows(chargerId, addDaysToDateString(today, offset))) {
              if (Date.parse(row.start_time) > now) slotRows.push(row); // never create past slots
            }
          }
        }
        for (let i = 0; i < slotRows.length; i += INSERT_CHUNK_SIZE) {
          await trx('slots').insert(slotRows.slice(i, i + INSERT_CHUNK_SIZE));
        }
      });
      added += 1;
    }
  }

  console.log(`Ogun/Oyo stations: ${added} added, ${REGION_STATIONS.length - added} already present`);
};
