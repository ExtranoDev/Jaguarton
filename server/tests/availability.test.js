const request = require('supertest');
const app = require('../src/app');
const {
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createScenario,
  createStation,
  createCharger,
  createSlot,
  futureTime,
  appDateString,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

const tomorrow = () => appDateString(futureTime(1, 0));

describe('GET /api/chargers/:id/slots', () => {
  it("returns the requested day's slots in time order", async () => {
    const { charger } = await createScenario();
    await createSlot(charger.id, futureTime(2, 9)); // a different day

    const res = await request(app).get(`/api/chargers/${charger.id}/slots?date=${tomorrow()}`);

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(3);
    const starts = res.body.slots.map((s) => s.start_time);
    expect(starts).toEqual([...starts].sort());
  });

  it('reports the available / booked / blocked split for a day', async () => {
    const { driver, charger, slots } = await createScenario();
    await request(app).post('/api/bookings').set(authHeader(driver)).send({ slotId: slots[0].id });
    await createSlot(charger.id, futureTime(1, 13), { status: 'blocked' });

    const res = await request(app).get(`/api/chargers/${charger.id}/slots?date=${tomorrow()}`);

    const count = (status) => res.body.slots.filter((s) => s.status === status).length;
    expect(count('available')).toBe(2);
    expect(count('booked')).toBe(1);
    expect(count('blocked')).toBe(1);
  });

  it('returns an empty list for a day with no slots', async () => {
    const { charger } = await createScenario();
    const res = await request(app).get(
      `/api/chargers/${charger.id}/slots?date=${appDateString(futureTime(10, 0))}`
    );
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it.each(['offline', 'unavailable'])('returns no bookable slots for a %s charger', async (status) => {
    const { operator } = await createScenario();
    const station = await createStation(operator.id, { name: 'Other Station' });
    const charger = await createCharger(station.id, { status });
    await createSlot(charger.id, futureTime(1, 10));

    const res = await request(app).get(`/api/chargers/${charger.id}/slots?date=${tomorrow()}`);

    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it('returns 404 for an unknown charger and 400 for a malformed date', async () => {
    const { charger } = await createScenario();

    const missing = await request(app).get(`/api/chargers/99999/slots?date=${tomorrow()}`);
    const badDate = await request(app).get(`/api/chargers/${charger.id}/slots?date=next-tuesday`);

    expect(missing.status).toBe(404);
    expect(badDate.status).toBe(400);
  });

  it('treats "a day" as a day in the app timezone, wherever the server runs', async () => {
    const { charger } = await createScenario();
    const day = appDateString(futureTime(2, 0));
    // 00:30 local is still the previous calendar day in UTC, the case a UTC
    // host used to get wrong. 12:30 is the control that is the same day in both.
    await createSlot(charger.id, new Date(futureTime(2, 0).getTime() + 30 * 60 * 1000));
    await createSlot(charger.id, new Date(futureTime(2, 12).getTime() + 30 * 60 * 1000));

    const res = await request(app).get(`/api/chargers/${charger.id}/slots?date=${day}`);

    expect(res.body.slots).toHaveLength(2);
  });

  it('rejects a date that matches the format but is not a real day', async () => {
    const { charger } = await createScenario();
    const res = await request(app).get(`/api/chargers/${charger.id}/slots?date=2026-02-30`);
    expect(res.status).toBe(400);
  });

  it('picks up a charger status change straight away', async () => {
    const { charger, operator } = await createScenario();
    const url = `/api/chargers/${charger.id}/slots?date=${tomorrow()}`;

    expect((await request(app).get(url)).body.slots).toHaveLength(3);

    await request(app)
      .patch(`/api/chargers/${charger.id}/status`)
      .set(authHeader(operator))
      .send({ status: 'offline' });

    expect((await request(app).get(url)).body.slots).toEqual([]);
  });
});

describe('availability counts on the station detail', () => {
  it('drops by one when a slot is booked and recovers when it is cancelled', async () => {
    const { driver, station, slots } = await createScenario();
    const openSlots = async () =>
      (await request(app).get(`/api/stations/${station.id}`)).body.station.chargers[0].availableSlotCount;

    expect(await openSlots()).toBe(3);

    const booked = await request(app)
      .post('/api/bookings')
      .set(authHeader(driver))
      .send({ slotId: slots[0].id });
    expect(await openSlots()).toBe(2);

    await request(app).patch(`/api/bookings/${booked.body.booking.id}/cancel`).set(authHeader(driver));
    expect(await openSlots()).toBe(3);
  });

  it('does not count slots that have already started', async () => {
    const { station, charger } = await createScenario();
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await createSlot(charger.id, past);

    const res = await request(app).get(`/api/stations/${station.id}`);

    expect(res.body.station.chargers[0].availableSlotCount).toBe(3);
  });
});

describe('operator slot management', () => {
  it('generates slots for a day and does not duplicate them on a second call', async () => {
    const { operator, charger } = await createScenario();
    const date = appDateString(futureTime(3, 0));
    const generate = () =>
      request(app)
        .post(`/api/chargers/${charger.id}/slots`)
        .set(authHeader(operator))
        .send({ date, startHour: 8, endHour: 12, durationMinutes: 60 });

    const first = await generate();
    const second = await generate();

    expect(first.status).toBe(201);
    expect(first.body.slots).toHaveLength(4);
    expect(second.body.slots).toHaveLength(0);

    const list = await request(app).get(`/api/chargers/${charger.id}/slots?date=${date}`);
    expect(list.body.slots).toHaveLength(4);
  });

  it('blocks a slot so it is no longer bookable, and refuses to touch a booked slot', async () => {
    const { operator, driver, slots } = await createScenario();

    const block = await request(app)
      .patch(`/api/slots/${slots[0].id}`)
      .set(authHeader(operator))
      .send({ status: 'blocked' });
    expect(block.status).toBe(200);

    const attempt = await request(app)
      .post('/api/bookings')
      .set(authHeader(driver))
      .send({ slotId: slots[0].id });
    expect(attempt.status).toBe(409);

    await request(app).post('/api/bookings').set(authHeader(driver)).send({ slotId: slots[1].id });
    const touchBooked = await request(app)
      .patch(`/api/slots/${slots[1].id}`)
      .set(authHeader(operator))
      .send({ status: 'blocked' });
    expect(touchBooked.status).toBe(409);
  });
});
