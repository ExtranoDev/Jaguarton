const request = require('supertest');
const app = require('../src/app');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createScenario,
  createStation,
  createCharger,
  createSlot,
  futureTime,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

function book(user, slotId) {
  return request(app).post('/api/bookings').set(authHeader(user)).send({ slotId });
}

describe('POST /api/bookings', () => {
  it('books an available slot and returns a reference plus booking details', async () => {
    const { driver, slots, station, charger } = await createScenario();

    const res = await book(driver, slots[0].id);

    expect(res.status).toBe(201);
    expect(res.body.bookingReference).toMatch(/^EVB-[A-Z0-9]{6}$/);
    expect(res.body.booking).toMatchObject({
      slot_id: slots[0].id,
      user_id: driver.id,
      status: 'confirmed',
      station_name: station.name,
      connector_type: charger.connector_type,
    });
    expect(Number(res.body.booking.price_at_booking)).toBe(Number(charger.price_per_kwh));

    const slot = await db('slots').where({ id: slots[0].id }).first();
    expect(slot.status).toBe('booked');
  });

  it('returns 404 for a slot that does not exist', async () => {
    const { driver } = await createScenario();
    const res = await book(driver, 99999);
    expect(res.status).toBe(404);
  });

  it('returns 409 for a slot that is already booked', async () => {
    const { driver, otherDriver, slots } = await createScenario();
    await book(driver, slots[0].id);

    const res = await book(otherDriver, slots[0].id);

    expect(res.status).toBe(409);
  });

  it('returns 409 for a blocked slot', async () => {
    const { driver, charger } = await createScenario();
    const blocked = await createSlot(charger.id, futureTime(1, 15), { status: 'blocked' });

    const res = await book(driver, blocked.id);

    expect(res.status).toBe(409);
  });

  it('returns 409 when the charger is offline, even if the slot row is available', async () => {
    const { driver, operator } = await createScenario();
    const station = await createStation(operator.id, { name: 'Offline Station' });
    const offline = await createCharger(station.id, { status: 'offline' });
    const slot = await createSlot(offline.id, futureTime(1, 10));

    const res = await book(driver, slot.id);

    expect(res.status).toBe(409);
    const stored = await db('slots').where({ id: slot.id }).first();
    expect(stored.status).toBe('available');
  });

  it('requires authentication', async () => {
    const { slots } = await createScenario();
    const res = await request(app).post('/api/bookings').send({ slotId: slots[0].id });
    expect(res.status).toBe(401);
  });

  it('is driver-only', async () => {
    const { operator, slots } = await createScenario();
    const res = await book(operator, slots[0].id);
    expect(res.status).toBe(403);
  });

  it('validates the request body', async () => {
    const { driver } = await createScenario();
    const res = await request(app).post('/api/bookings').set(authHeader(driver)).send({});
    expect(res.status).toBe(400);
  });
});

describe('reading bookings', () => {
  it("lists only the caller's own bookings, with station and time details", async () => {
    const { driver, otherDriver, slots } = await createScenario();
    await book(driver, slots[0].id);
    await book(otherDriver, slots[1].id);

    const res = await request(app).get('/api/bookings/me').set(authHeader(driver));

    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.bookings[0]).toMatchObject({ user_id: driver.id, station_name: 'Test Station' });
    expect(res.body.bookings[0].start_time).toBeTruthy();
  });

  it('lets the owner, and the station operator, view a booking but nobody else', async () => {
    const { driver, otherDriver, operator, otherOperator, slots } = await createScenario();
    const created = await book(driver, slots[0].id);
    const id = created.body.booking.id;

    const asOwner = await request(app).get(`/api/bookings/${id}`).set(authHeader(driver));
    const asOperator = await request(app).get(`/api/bookings/${id}`).set(authHeader(operator));
    const asOtherDriver = await request(app).get(`/api/bookings/${id}`).set(authHeader(otherDriver));
    const asOtherOperator = await request(app).get(`/api/bookings/${id}`).set(authHeader(otherOperator));

    expect(asOwner.status).toBe(200);
    expect(asOperator.status).toBe(200);
    expect(asOtherDriver.status).toBe(403);
    expect(asOtherOperator.status).toBe(403);
  });

  it('returns 404 for an unknown booking', async () => {
    const { driver } = await createScenario();
    const res = await request(app).get('/api/bookings/99999').set(authHeader(driver));
    expect(res.status).toBe(404);
  });

  it("shows an operator only bookings for their own stations", async () => {
    const { driver, operator, otherOperator, slots } = await createScenario();
    await book(driver, slots[0].id);

    const own = await request(app).get('/api/operator/bookings').set(authHeader(operator));
    const other = await request(app).get('/api/operator/bookings').set(authHeader(otherOperator));

    expect(own.body.bookings).toHaveLength(1);
    expect(own.body.bookings[0]).toMatchObject({
      driver_name: driver.name,
      driver_email: driver.email,
      station_name: 'Test Station',
      connector_type: 'CCS2_DC',
      status: 'confirmed',
    });
    expect(own.body.bookings[0].start_time).toBeTruthy();
    expect(other.body.bookings).toHaveLength(0);
  });
});

describe('operator booking filters', () => {
  it('filters by station and status', async () => {
    const { driver, operator, slots } = await createScenario();
    const secondStation = await createStation(operator.id, { name: 'Second Station' });
    const secondCharger = await createCharger(secondStation.id);
    const secondSlot = await createSlot(secondCharger.id, futureTime(1, 14)); // not overlapping slots[0]
    await book(driver, slots[0].id);
    const second = await book(driver, secondSlot.id);
    await request(app).patch(`/api/bookings/${second.body.booking.id}/cancel`).set(authHeader(driver));

    const byStation = await request(app)
      .get(`/api/operator/bookings?stationId=${secondStation.id}`)
      .set(authHeader(operator));
    const confirmedOnly = await request(app)
      .get('/api/operator/bookings?status=confirmed')
      .set(authHeader(operator));

    expect(byStation.body.bookings).toHaveLength(1);
    expect(byStation.body.bookings[0].station_name).toBe('Second Station');
    expect(confirmedOnly.body.bookings).toHaveLength(1);
    expect(confirmedOnly.body.bookings[0].station_name).toBe('Test Station');
  });
});

describe('PATCH /api/bookings/:id/cancel', () => {
  it('cancels the booking and frees the slot', async () => {
    const { driver, slots } = await createScenario();
    const created = await book(driver, slots[0].id);

    const res = await request(app)
      .patch(`/api/bookings/${created.body.booking.id}/cancel`)
      .set(authHeader(driver));

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');
    const slot = await db('slots').where({ id: slots[0].id }).first();
    expect(slot.status).toBe('available');
  });

  it("does not let another driver cancel someone else's booking", async () => {
    const { driver, otherDriver, slots } = await createScenario();
    const created = await book(driver, slots[0].id);

    const res = await request(app)
      .patch(`/api/bookings/${created.body.booking.id}/cancel`)
      .set(authHeader(otherDriver));

    expect(res.status).toBe(403);
    const slot = await db('slots').where({ id: slots[0].id }).first();
    expect(slot.status).toBe('booked');
  });

  it('is idempotent', async () => {
    const { driver, slots } = await createScenario();
    const created = await book(driver, slots[0].id);
    const path = `/api/bookings/${created.body.booking.id}/cancel`;

    await request(app).patch(path).set(authHeader(driver));
    const again = await request(app).patch(path).set(authHeader(driver));

    expect(again.status).toBe(200);
    expect(again.body.booking.status).toBe('cancelled');
  });
});
