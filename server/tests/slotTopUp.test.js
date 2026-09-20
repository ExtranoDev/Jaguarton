const request = require('supertest');
const app = require('../src/app');
const { topUpSlots } = require('../src/modules/slots/slots.service');
const { zonedTimeToDate } = require('../src/utils/time');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createScenario,
  createStation,
  createCharger,
  futureTime,
  appDateString,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

function topUp(user, body = {}) {
  return request(app).post('/api/operator/slots/top-up').set(authHeader(user)).send(body);
}

async function scenarioWithoutSlots() {
  const scenario = await createScenario();
  await db('slots').del();
  return scenario;
}

describe('POST /api/operator/slots/top-up', () => {
  it('creates future slots for the operator\'s chargers and is idempotent', async () => {
    const { operator, charger } = await scenarioWithoutSlots();

    const first = await topUp(operator, { days: 3 });

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ chargers: 1, days: 3 });
    // 12 hourly slots (08:00-19:00) per day for 3 days, minus any of today's that already started.
    expect(first.body.created).toBeGreaterThanOrEqual(24);
    expect(first.body.created).toBeLessThanOrEqual(36);

    const stored = await db('slots').where({ charger_id: charger.id });
    expect(stored).toHaveLength(first.body.created);
    expect(stored.every((s) => new Date(s.start_time).getTime() > Date.now())).toBe(true);

    const second = await topUp(operator, { days: 3 });
    expect(second.body.created).toBe(0);
  });

  it('only adds the missing days when extended', async () => {
    const { operator } = await scenarioWithoutSlots();
    await topUp(operator, { days: 2 });

    const extended = await topUp(operator, { days: 3 });

    expect(extended.body.created).toBe(12); // just the third day
  });

  it('lays slots out on the app-timezone day, 08:00 to 19:00', async () => {
    const { operator, charger } = await scenarioWithoutSlots();
    await topUp(operator, { days: 3 });

    const tomorrow = appDateString(futureTime(1, 0));
    const res = await request(app).get(`/api/chargers/${charger.id}/slots?date=${tomorrow}`);

    expect(res.body.slots).toHaveLength(12);
    expect(res.body.slots[0].start_time).toBe(zonedTimeToDate(tomorrow, 8, 0).toISOString());
    expect(res.body.slots[11].start_time).toBe(zonedTimeToDate(tomorrow, 19, 0).toISOString());
  });

  it('leaves other operators\' chargers alone', async () => {
    const { operator, otherOperator } = await scenarioWithoutSlots();
    const otherStation = await createStation(otherOperator.id, { name: 'Not Mine' });
    const otherCharger = await createCharger(otherStation.id);

    await topUp(operator, { days: 2 });

    expect(await db('slots').where({ charger_id: otherCharger.id })).toHaveLength(0);
  });

  it('can be limited to one station, which the caller must own', async () => {
    const { operator, otherOperator, station } = await scenarioWithoutSlots();
    const secondStation = await createStation(operator.id, { name: 'Second Station' });
    const secondCharger = await createCharger(secondStation.id);

    const limited = await topUp(operator, { days: 2, stationId: secondStation.id });
    expect(limited.body.chargers).toBe(1);
    expect((await db('slots').where({ charger_id: secondCharger.id })).length).toBe(limited.body.created);

    const notOwner = await topUp(otherOperator, { days: 2, stationId: station.id });
    expect(notOwner.status).toBe(403);

    const missing = await topUp(operator, { days: 2, stationId: 99999 });
    expect(missing.status).toBe(404);
  });

  it('is operator-only and validates days', async () => {
    const { operator, driver } = await scenarioWithoutSlots();

    expect((await topUp(driver, { days: 2 })).status).toBe(403);
    expect((await request(app).post('/api/operator/slots/top-up').send({})).status).toBe(401);
    expect((await topUp(operator, { days: 0 })).status).toBe(400);
    expect((await topUp(operator, { days: 31 })).status).toBe(400);
  });

  it('does not touch existing bookings or booked slots', async () => {
    const { operator, driver, charger } = await createScenario();
    const [existing] = await db('slots').where({ charger_id: charger.id }).orderBy('start_time');
    await request(app).post('/api/bookings').set(authHeader(driver)).send({ slotId: existing.id });

    await topUp(operator, { days: 3 });

    const after = await db('slots').where({ id: existing.id }).first();
    expect(after.status).toBe('booked');
    expect(await db('bookings').where({ slot_id: existing.id, status: 'confirmed' })).toHaveLength(1);
  });
});

describe('topUpSlots (used by the npm script)', () => {
  it('covers every charger when no operator is given', async () => {
    const { operator } = await scenarioWithoutSlots();
    const otherStation = await createStation(operator.id, { name: 'Another' });
    await createCharger(otherStation.id);

    const result = await topUpSlots({ days: 2 });

    expect(result.chargers).toBe(2);
    expect(result.created).toBeGreaterThan(0);
  });
});
