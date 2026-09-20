const request = require('supertest');
const app = require('../src/app');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createAdmin,
  createScenario,
  createStation,
  createCharger,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

const setUserActive = (user, isActive) => db('users').where({ id: user.id }).update({ is_active: isActive });
const setStationActive = (station, isActive) => db('stations').where({ id: station.id }).update({ is_active: isActive });
const book = (user, slotId) => request(app).post('/api/bookings').set(authHeader(user)).send({ slotId });

describe('suspended users', () => {
  it('lose access with a token they already hold, on every authenticated route', async () => {
    const { driver, operator } = await createScenario();
    const driverToken = authHeader(driver);
    const operatorToken = authHeader(operator);
    expect((await request(app).get('/api/bookings/me').set(driverToken)).status).toBe(200);
    expect((await request(app).get('/api/operator/stations').set(operatorToken)).status).toBe(200);

    await setUserActive(driver, false);
    await setUserActive(operator, false);

    const driverRes = await request(app).get('/api/bookings/me').set(driverToken);
    expect(driverRes.status).toBe(403);
    expect(driverRes.body.error).toMatch(/suspended/i);
    expect((await request(app).get('/api/auth/me').set(driverToken)).status).toBe(403);
    expect((await request(app).get('/api/operator/stations').set(operatorToken)).status).toBe(403);
  });

  it('cannot book with an existing token, and the slot is untouched', async () => {
    const { driver, slots } = await createScenario();
    const token = authHeader(driver);
    await setUserActive(driver, false);

    const res = await request(app).post('/api/bookings').set(token).send({ slotId: slots[0].id });

    expect(res.status).toBe(403);
    expect((await db('slots').where({ id: slots[0].id }).first()).status).toBe('available');
  });

  it('get access back as soon as they are reactivated, with the same token', async () => {
    const { driver } = await createScenario();
    const token = authHeader(driver);
    await setUserActive(driver, false);
    expect((await request(app).get('/api/bookings/me').set(token)).status).toBe(403);

    await setUserActive(driver, true);

    expect((await request(app).get('/api/bookings/me').set(token)).status).toBe(200);
  });

  it('are refused at login, but only once the password is right', async () => {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Ada Driver', email: 'ada@test.dev', password: 'secret123', role: 'driver' });
    expect(signup.status).toBe(201);
    await setUserActive(signup.body.user, false);

    const suspended = await request(app).post('/api/auth/login').send({ email: 'ada@test.dev', password: 'secret123' });
    expect(suspended.status).toBe(403);
    expect(suspended.body.error).toMatch(/suspended/i);
    expect(suspended.body).not.toHaveProperty('token');

    // A wrong password gets the usual 401, so login can't be used to find out who is suspended.
    const wrong = await request(app).post('/api/auth/login').send({ email: 'ada@test.dev', password: 'nope-nope' });
    expect(wrong.status).toBe(401);

    await setUserActive(signup.body.user, true);
    const ok = await request(app).post('/api/auth/login').send({ email: 'ada@test.dev', password: 'secret123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ email: 'ada@test.dev', is_active: true });
  });

  it("can't be used to reach the admin API, even for a suspended admin", async () => {
    const admin = await createAdmin();
    const token = authHeader(admin);
    expect((await request(app).get('/api/admin/overview').set(token)).status).toBe(200);

    await setUserActive(admin, false);

    expect((await request(app).get('/api/admin/overview').set(token)).status).toBe(403);
  });

  it('a token for a user that no longer exists is a 401', async () => {
    const { driver } = await createScenario();
    const token = authHeader(driver);
    await db('bookings').del();
    await db('users').where({ id: driver.id }).del();

    expect((await request(app).get('/api/bookings/me').set(token)).status).toBe(401);
  });
});

describe('deactivated stations', () => {
  it('disappear from the public list and detail, and have no slots to offer', async () => {
    const { operator, station, charger } = await createScenario();
    const visible = await createStation(operator.id, { name: 'Still Open' });
    await createCharger(visible.id);

    await setStationActive(station, false);

    const list = await request(app).get('/api/stations');
    expect(list.body.stations.map((s) => s.name)).toEqual(['Still Open']);
    const filtered = await request(app).get('/api/stations?status=online&connectorType=CCS2_DC');
    expect(filtered.body.stations.map((s) => s.name)).toEqual(['Still Open']);

    expect((await request(app).get(`/api/stations/${station.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/stations/${visible.id}`)).status).toBe(200);
    const slots = await request(app).get(`/api/chargers/${charger.id}/slots`);
    expect(slots.status).toBe(200);
    expect(slots.body.slots).toEqual([]);
  });

  it('cannot be booked: 409, and the slot stays available', async () => {
    const { driver, station, slots } = await createScenario();
    await setStationActive(station, false);

    const res = await book(driver, slots[0].id);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/station/i);
    expect((await db('slots').where({ id: slots[0].id }).first()).status).toBe('available');
    expect(await db('bookings')).toHaveLength(0);
  });

  it('come back everywhere when reactivated', async () => {
    const { driver, station, charger, slots } = await createScenario();
    await setStationActive(station, false);
    await setStationActive(station, true);

    expect((await request(app).get('/api/stations')).body.stations).toHaveLength(1);
    expect((await request(app).get(`/api/stations/${station.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/chargers/${charger.id}/slots`)).body.slots).toHaveLength(3);
    expect((await book(driver, slots[0].id)).status).toBe(201);
  });

  it("are still listed for their operator, flagged inactive, with their chargers", async () => {
    const { operator, station, charger } = await createScenario();
    await setStationActive(station, false);

    const res = await request(app).get('/api/operator/stations').set(authHeader(operator));

    expect(res.status).toBe(200);
    expect(res.body.stations).toHaveLength(1);
    expect(res.body.stations[0]).toMatchObject({ id: station.id, is_active: false });
    expect(res.body.stations[0].chargers.map((c) => c.id)).toEqual([charger.id]);
  });

  it('keep existing bookings visible to the driver who made them', async () => {
    const { driver, station, slots } = await createScenario();
    const booked = await book(driver, slots[0].id);
    await setStationActive(station, false);

    const mine = await request(app).get('/api/bookings/me').set(authHeader(driver));
    const detail = await request(app).get(`/api/bookings/${booked.body.booking.id}`).set(authHeader(driver));

    expect(mine.body.bookings).toHaveLength(1);
    expect(mine.body.bookings[0].station_name).toBe('Test Station');
    expect(detail.status).toBe(200);
  });

  it('report is_active as a real boolean on both database engines', async () => {
    const { station } = await createScenario();
    const list = await request(app).get('/api/stations');
    expect(list.body.stations[0].is_active).toBe(true);
    expect((await request(app).get(`/api/stations/${station.id}`)).body.station.is_active).toBe(true);
  });
});
