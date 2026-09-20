const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const { jwtSecret } = require('../src/config/env');
const { zonedTimeToDate, toZonedDateString, addDaysToDateString } = require('../src/utils/time');

async function setupDatabase() {
  await db.migrate.latest();
}

async function resetDatabase() {
  // Children before parents so FK constraints are satisfied.
  await db('admin_actions').del();
  await db('bookings').del();
  await db('slots').del();
  await db('chargers').del();
  await db('stations').del();
  await db('users').del();
}

async function teardownDatabase() {
  await db.destroy();
}

async function createUser({ name, email, role, ...overrides }) {
  const [user] = await db('users')
    .insert({ name, email, role, password_hash: 'not-a-real-hash', ...overrides })
    .returning('*');
  return user;
}

async function createAdmin(overrides = {}) {
  return createUser({ name: 'Admin One', email: 'admin1@test.dev', role: 'admin', ...overrides });
}

function tokenFor(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '1h' });
}

function authHeader(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

async function createStation(ownerId, overrides = {}) {
  const [station] = await db('stations')
    .insert({
      owner_id: ownerId,
      name: 'Test Station',
      address: '1 Test Street, Lagos',
      lat: 6.45,
      lng: 3.42,
      ...overrides,
    })
    .returning('*');
  return station;
}

async function createCharger(stationId, overrides = {}) {
  const [charger] = await db('chargers')
    .insert({
      station_id: stationId,
      connector_type: 'CCS2_DC',
      power_kw: 50,
      price_per_kwh: 200,
      status: 'online',
      ...overrides,
    })
    .returning('*');
  return charger;
}

// The instant at `hour`:00 in the app timezone, `daysAhead` days from today.
// Slots in tests are always in the future so "already started" logic never
// interferes, and none of this depends on the timezone of the machine running
// the tests.
function futureTime(daysAhead, hour) {
  const day = addDaysToDateString(toZonedDateString(new Date()), daysAhead);
  return zonedTimeToDate(day, hour, 0);
}

function appDateString(date) {
  return toZonedDateString(date);
}

async function createSlot(chargerId, start, overrides = {}) {
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const [slot] = await db('slots')
    .insert({
      charger_id: chargerId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'available',
      ...overrides,
    })
    .returning('*');
  return slot;
}

// The standard fixture most tests start from: one operator with one station,
// one online charger, and three hourly slots tomorrow (10:00, 11:00, 12:00).
async function createScenario() {
  const operator = await createUser({ name: 'Op One', email: 'op1@test.dev', role: 'operator' });
  const otherOperator = await createUser({ name: 'Op Two', email: 'op2@test.dev', role: 'operator' });
  const driver = await createUser({ name: 'Driver One', email: 'driver1@test.dev', role: 'driver' });
  const otherDriver = await createUser({ name: 'Driver Two', email: 'driver2@test.dev', role: 'driver' });

  const station = await createStation(operator.id);
  const charger = await createCharger(station.id);
  const slots = [];
  for (const hour of [10, 11, 12]) {
    slots.push(await createSlot(charger.id, futureTime(1, hour)));
  }

  return { operator, otherOperator, driver, otherDriver, station, charger, slots };
}

module.exports = {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  createUser,
  createAdmin,
  tokenFor,
  authHeader,
  createStation,
  createCharger,
  createSlot,
  createScenario,
  futureTime,
  appDateString,
};
