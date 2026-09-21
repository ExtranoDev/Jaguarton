const request = require('supertest');
const app = require('../src/app');
const { seed } = require('../src/db/seeds/07_stations_ogun_oyo');
const { OGUN, OYO, OGUN_OPERATOR, OYO_OPERATOR, REGION_STATIONS } = require('../src/db/seedData/regionStations');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createUser,
  createStation,
  createScenario,
  createCharger,
  createSlot,
  futureTime,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

const ORIGINAL_ENV = { SEED_PASSWORD: process.env.SEED_PASSWORD, NODE_ENV: process.env.NODE_ENV };
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {}); // the seed prints a summary line
  process.env.SEED_PASSWORD = 'region-seed-pass';
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const userByEmail = (email) => db('users').where({ email }).first();
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const stationNames = async (ownerId) => (await db('stations').where({ owner_id: ownerId }).orderBy('id')).map((s) => s.name);

describe('Ogun and Oyo station data', () => {
  it('has unique names, and coordinates that fall inside each state', () => {
    const names = REGION_STATIONS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);

    // Loose bounding boxes around each state (the mock data is town-centre approximate).
    for (const station of OGUN) {
      expect(station.lat).toBeGreaterThan(6.3);
      expect(station.lat).toBeLessThan(7.6);
      expect(station.lng).toBeGreaterThan(2.7);
      expect(station.lng).toBeLessThan(4.2);
      expect(station.address).toMatch(/Ogun State$/);
    }
    for (const station of OYO) {
      expect(station.lat).toBeGreaterThan(7.2);
      expect(station.lat).toBeLessThan(9.1);
      expect(station.lng).toBeGreaterThan(2.7);
      expect(station.lng).toBeLessThan(4.6);
      expect(station.address).toMatch(/Oyo State$/);
    }
    expect(OGUN.length).toBeGreaterThanOrEqual(8);
    expect(OYO.length).toBeGreaterThanOrEqual(8);
  });
});

describe('07_stations_ogun_oyo seed', () => {
  it('adds every station with chargers and future slots', async () => {
    await seed(db);

    const stations = await db('stations');
    expect(stations).toHaveLength(REGION_STATIONS.length);
    expect(stations.every((s) => Boolean(s.is_active))).toBe(true);

    for (const station of stations) {
      const chargers = await db('chargers').where({ station_id: station.id });
      expect(chargers.length).toBeGreaterThanOrEqual(2);
      const slots = await db('slots').whereIn('charger_id', chargers.map((c) => c.id));
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((s) => new Date(s.start_time).getTime() > Date.now() && s.status === 'available')).toBe(true);
    }
    // A realistic mix, like the Lagos set: mostly online, with the odd offline/unavailable charger.
    const statuses = new Set((await db('chargers')).map((c) => c.status));
    expect(statuses.has('online')).toBe(true);
  });

  it('gives each state its own operator, who owns only that state\'s stations', async () => {
    await seed(db);

    const ogun = await userByEmail(OGUN_OPERATOR.email);
    const oyo = await userByEmail(OYO_OPERATOR.email);
    expect(ogun).toMatchObject({ name: OGUN_OPERATOR.name, role: 'operator' });
    expect(oyo).toMatchObject({ name: OYO_OPERATOR.name, role: 'operator' });
    expect(Boolean(ogun.is_active) && Boolean(oyo.is_active)).toBe(true);
    expect(await stationNames(ogun.id)).toEqual(OGUN.map((s) => s.name));
    expect(await stationNames(oyo.id)).toEqual(OYO.map((s) => s.name));
    // They can log in with the seed password, and with nothing else.
    expect((await login(OGUN_OPERATOR.email, 'region-seed-pass')).status).toBe(200);
    expect((await login(OYO_OPERATOR.email, 'password123')).status).toBe(401);
  });

  it('shows each operator only their own state, in their dashboard and on the public pages', async () => {
    await seed(db);
    const ogun = await userByEmail(OGUN_OPERATOR.email);
    const oyo = await userByEmail(OYO_OPERATOR.email);
    const oyoStation = await db('stations').where({ name: 'Bodija Market EV Point' }).first();

    const dashboard = await request(app).get('/api/operator/stations').set(authHeader(ogun));
    expect(dashboard.body.stations.map((s) => s.name)).toEqual(OGUN.map((s) => s.name));

    const publicList = await request(app).get('/api/stations').set(authHeader(ogun));
    expect(publicList.body.stations.map((s) => s.name)).toEqual(OGUN.map((s) => s.name));
    expect((await request(app).get(`/api/stations/${oyoStation.id}`).set(authHeader(ogun))).status).toBe(404);
    expect((await request(app).get(`/api/stations/${oyoStation.id}`).set(authHeader(oyo))).status).toBe(200);
    // ...while a driver (or anyone not signed in) still sees every station.
    expect((await request(app).get('/api/stations')).body.stations).toHaveLength(REGION_STATIONS.length);
  });

  it('is idempotent: running it again adds no stations, chargers, slots or accounts', async () => {
    await seed(db);
    const counts = async () => ({
      users: Number((await db('users').count('* as n').first()).n),
      stations: Number((await db('stations').count('* as n').first()).n),
      chargers: Number((await db('chargers').count('* as n').first()).n),
      slots: Number((await db('slots').count('* as n').first()).n),
    });
    const first = await counts();

    await seed(db);

    expect(await counts()).toEqual(first);
    expect(first.users).toBe(2);
  });

  it('never touches existing data, and adds only what is missing', async () => {
    // A live database: another operator's station (with a booking), and one of our names already taken.
    const { driver, operator, slots } = await createScenario();
    await request(app).post('/api/bookings').set(authHeader(driver)).send({ slotId: slots[0].id });
    const existing = await createStation(operator.id, { name: OGUN[0].name, address: 'Edited by the owner', lat: 7.0, lng: 3.0 });
    const existingCharger = await createCharger(existing.id);
    await createSlot(existingCharger.id, futureTime(2, 9));
    const before = {
      users: await db('users').orderBy('id'),
      bookings: await db('bookings'),
      slots: await db('slots').where({ charger_id: slots[0].charger_id }).orderBy('id'),
    };

    await seed(db);

    // Everything that was there is untouched (the seed only added its two operators)...
    expect(await db('users').whereIn('id', before.users.map((u) => u.id)).orderBy('id')).toEqual(before.users);
    expect(await db('bookings')).toEqual(before.bookings);
    expect(await db('slots').where({ charger_id: slots[0].charger_id }).orderBy('id')).toEqual(before.slots);
    expect(await db('stations').where({ id: existing.id }).first()).toMatchObject({
      name: OGUN[0].name,
      address: 'Edited by the owner',
      owner_id: operator.id,
    });
    expect(await db('chargers').where({ station_id: existing.id })).toHaveLength(1);
    // ...and only the missing stations were added (the taken name was skipped).
    const seededOwners = [(await userByEmail(OGUN_OPERATOR.email)).id, (await userByEmail(OYO_OPERATOR.email)).id];
    expect(await db('stations').whereIn('owner_id', seededOwners)).toHaveLength(REGION_STATIONS.length - 1);
  });

  it('reuses an operator account that already exists instead of creating a second', async () => {
    const existing = await createUser({ name: 'Already Here', email: OGUN_OPERATOR.email, role: 'operator' });

    await seed(db);

    expect(await db('users').where({ email: OGUN_OPERATOR.email })).toHaveLength(1);
    expect(await stationNames(existing.id)).toEqual(OGUN.map((s) => s.name));
  });

  it("refuses if an operator email already belongs to someone who isn't an operator", async () => {
    await createUser({ name: 'Some Driver', email: OGUN_OPERATOR.email, role: 'driver' });

    await expect(seed(db)).rejects.toThrow(/not an operator/);
    expect(await db('stations')).toHaveLength(0);
  });

  it('in production, will not create accounts with the well-known demo password', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SEED_PASSWORD;

    await expect(seed(db)).rejects.toThrow(/Set SEED_PASSWORD/);

    expect(await db('users')).toHaveLength(0);
    expect(await db('stations')).toHaveLength(0);
  });

  it('makes the stations bookable through the public API', async () => {
    const driver = await createUser({ name: 'Driver', email: 'driver@example.com', role: 'driver' });
    await seed(db);

    const list = await request(app).get('/api/stations');
    const ibadan = list.body.stations.find((s) => s.name === 'Bodija Market EV Point');
    expect(ibadan).toMatchObject({ address: 'Bodija, Ibadan, Oyo State', is_active: true });
    expect(ibadan.chargers.length).toBeGreaterThanOrEqual(2);

    const online = ibadan.chargers.find((c) => c.status === 'online');
    const slot = await db('slots').where({ charger_id: online.id, status: 'available' }).orderBy('start_time').first();
    const booked = await request(app).post('/api/bookings').set(authHeader(driver)).send({ slotId: slot.id });
    expect(booked.status).toBe(201);
    expect(booked.body.booking.station_name).toBe('Bodija Market EV Point');
  });
});
