const request = require('supertest');
const app = require('../src/app');
const { isUniqueViolation } = require('../src/utils/dbErrors');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createUser,
  createScenario,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

function book(user, slotId) {
  return request(app).post('/api/bookings').set(authHeader(user)).send({ slotId });
}

async function confirmedBookingsFor(slotId) {
  return db('bookings').where({ slot_id: slotId, status: 'confirmed' });
}

describe('double-booking prevention', () => {
  it('lets exactly one of two simultaneous requests win the same slot', async () => {
    const { driver, otherDriver, slots } = await createScenario();

    const results = await Promise.all([book(driver, slots[0].id), book(otherDriver, slots[0].id)]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await confirmedBookingsFor(slots[0].id)).toHaveLength(1);
    expect((await db('slots').where({ id: slots[0].id }).first()).status).toBe('booked');
  });

  it('lets exactly one of many simultaneous requests win', async () => {
    const { driver, otherDriver, slots } = await createScenario();
    const extraDrivers = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        createUser({ name: `Extra ${n}`, email: `extra${n}@test.dev`, role: 'driver' })
      )
    );
    const everyone = [driver, otherDriver, ...extraDrivers];

    const results = await Promise.all(everyone.map((user) => book(user, slots[0].id)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(everyone.length - 1);
    expect(await confirmedBookingsFor(slots[0].id)).toHaveLength(1);
  });

  it('stops the same driver double-clicking into two bookings', async () => {
    const { driver, slots } = await createScenario();

    const results = await Promise.all([book(driver, slots[0].id), book(driver, slots[0].id)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await confirmedBookingsFor(slots[0].id)).toHaveLength(1);
  });

  it('does not create false conflicts between different slots', async () => {
    const { driver, otherDriver, slots } = await createScenario();

    const results = await Promise.all([book(driver, slots[0].id), book(otherDriver, slots[1].id)]);

    expect(results.map((r) => r.status)).toEqual([201, 201]);
  });

  it('rejects a second confirmed booking for a slot even if application checks are bypassed', async () => {
    const { driver, otherDriver, station, slots } = await createScenario();
    const slot = slots[0];
    const insert = (user, reference) =>
      db('bookings').insert({
        slot_id: slot.id,
        user_id: user.id,
        charger_id: slot.charger_id,
        station_id: station.id,
        booking_reference: reference,
        price_at_booking: 200,
        status: 'confirmed',
      });

    await insert(driver, 'EVB-DIRECT1');

    let error;
    try {
      await insert(otherDriver, 'EVB-DIRECT2');
    } catch (err) {
      error = err;
    }

    expect(isUniqueViolation(error)).toBe(true);
    expect(await confirmedBookingsFor(slot.id)).toHaveLength(1);
  });

  it('allows the slot to be rebooked once the first booking is cancelled', async () => {
    const { driver, otherDriver, slots } = await createScenario();
    const first = await book(driver, slots[0].id);
    expect(first.status).toBe(201);

    const blocked = await book(otherDriver, slots[0].id);
    expect(blocked.status).toBe(409);

    await request(app).patch(`/api/bookings/${first.body.booking.id}/cancel`).set(authHeader(driver));

    const rebooked = await book(otherDriver, slots[0].id);
    expect(rebooked.status).toBe(201);
    expect(await confirmedBookingsFor(slots[0].id)).toHaveLength(1);
    expect(await db('bookings').where({ slot_id: slots[0].id })).toHaveLength(2);
  });
});
