// An operator can only view the stations that belong to them: not in their own dashboard, not
// through the public station pages, and not by changing anything either.
const request = require('supertest');
const app = require('../src/app');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createUser,
  createAdmin,
  createStation,
  createCharger,
  createSlot,
  futureTime,
  tokenFor,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

// Two operators, each with a station, a charger and a slot; plus a driver.
async function twoOperators() {
  const anna = await createUser({ name: 'Anna', email: 'anna@test.dev', role: 'operator' });
  const ben = await createUser({ name: 'Ben', email: 'ben@test.dev', role: 'operator' });
  const driver = await createUser({ name: 'Dee', email: 'dee@test.dev', role: 'driver' });
  const build = async (owner, name) => {
    const station = await createStation(owner.id, { name });
    const charger = await createCharger(station.id);
    const slot = await createSlot(charger.id, futureTime(1, 10));
    return { station, charger, slot };
  };
  return { anna, ben, driver, annas: await build(anna, "Anna's Station"), bens: await build(ben, "Ben's Station") };
}

const get = (path, user) => {
  const req = request(app).get(path);
  return user ? req.set(authHeader(user)) : req;
};

describe('the public station pages, seen by an operator', () => {
  it('lists only their own stations', async () => {
    const { anna, ben } = await twoOperators();

    expect((await get('/api/stations', anna)).body.stations.map((s) => s.name)).toEqual(["Anna's Station"]);
    expect((await get('/api/stations', ben)).body.stations.map((s) => s.name)).toEqual(["Ben's Station"]);
  });

  it('keeps every filter working within their own stations', async () => {
    const { anna, annas } = await twoOperators();
    await createCharger(annas.station.id, { connector_type: 'Type2_AC', status: 'offline' });

    const online = await get('/api/stations?status=online', anna);
    const chademo = await get('/api/stations?connectorType=CHAdeMO_DC', anna);

    expect(online.body.stations.map((s) => s.id)).toEqual([annas.station.id]);
    expect(chademo.body.stations).toEqual([]);
    const either = await get('/api/stations?connectorType=CHAdeMO_DC,Type2_AC', anna);
    expect(either.body.stations.map((s) => s.id)).toEqual([annas.station.id]);
    expect((await get('/api/stations?connectorType=Type2_AC&status=online', anna)).body.stations).toEqual([]); // the Type 2 is offline
    expect((await get('/api/stations?connectorType=CCS2_DC,Tesla', anna)).status).toBe(400);
  });

  it("returns 404 (not 403) for another operator's station, so its existence isn't revealed", async () => {
    const { anna, bens } = await twoOperators();

    const res = await get(`/api/stations/${bens.station.id}`, anna);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Station not found');
    expect((await get('/api/stations/99999', anna)).body).toEqual(res.body); // same answer as a station that doesn't exist
  });

  it('opens their own station, including one an admin has deactivated', async () => {
    const { anna, annas } = await twoOperators();
    await db('stations').where({ id: annas.station.id }).update({ is_active: false });

    const own = await get(`/api/stations/${annas.station.id}`, anna);
    const anonymous = await get(`/api/stations/${annas.station.id}`);

    expect(own.status).toBe(200);
    expect(own.body.station).toMatchObject({ name: "Anna's Station", is_active: false });
    expect(anonymous.status).toBe(404); // still hidden from the public
  });

  it("returns 404 for the slots of another operator's charger, and shows their own", async () => {
    const { anna, annas, bens } = await twoOperators();

    expect((await get(`/api/chargers/${bens.charger.id}/slots`, anna)).status).toBe(404);
    const own = await get(`/api/chargers/${annas.charger.id}/slots`, anna);
    expect(own.status).toBe(200);
    expect(own.body.slots).toHaveLength(1);
  });
});

describe('everyone else is unaffected', () => {
  it('drivers, admins and anonymous visitors still see every station', async () => {
    const { driver, bens } = await twoOperators();
    const admin = await createAdmin();

    for (const viewer of [driver, admin, null]) {
      expect((await get('/api/stations', viewer)).body.stations).toHaveLength(2);
      expect((await get(`/api/stations/${bens.station.id}`, viewer)).status).toBe(200);
      expect((await get(`/api/chargers/${bens.charger.id}/slots`, viewer)).status).toBe(200);
    }
  });

  it('a garbage, expired or suspended token gets the ordinary public view, not an error', async () => {
    const { anna } = await twoOperators();
    const garbage = await request(app).get('/api/stations').set({ Authorization: 'Bearer not-a-token' });
    expect(garbage.status).toBe(200);
    expect(garbage.body.stations).toHaveLength(2);

    // Anna's own station is now hidden from everyone, because its operator is suspended.
    await db('users').where({ id: anna.id }).update({ is_active: false });
    const suspended = await request(app).get('/api/stations').set({ Authorization: `Bearer ${tokenFor(anna)}` });
    expect(suspended.status).toBe(200);
    expect(suspended.body.stations.map((s) => s.name)).toEqual(["Ben's Station"]);
  });
});

describe("an operator's own tools stay scoped to them", () => {
  it('shows only their stations and bookings, and cannot change anyone else\'s', async () => {
    const { anna, driver, annas, bens } = await twoOperators();
    await request(app).post('/api/bookings').set(authHeader(driver)).send({ slotId: bens.slot.id });

    const mine = await get('/api/operator/stations', anna);
    const bookings = await get('/api/operator/bookings', anna);
    expect(mine.body.stations.map((s) => s.id)).toEqual([annas.station.id]);
    expect(bookings.body.bookings).toEqual([]); // the only booking is at Ben's station

    const edits = [
      request(app).put(`/api/stations/${bens.station.id}`).set(authHeader(anna)).send({ name: 'Hijacked', address: 'x', lat: 6, lng: 3 }),
      request(app).post(`/api/stations/${bens.station.id}/chargers`).set(authHeader(anna)).send({ connectorType: 'CCS2_DC', powerKw: 50, pricePerKwh: 100 }),
      request(app).patch(`/api/chargers/${bens.charger.id}/status`).set(authHeader(anna)).send({ status: 'offline' }),
      request(app).post(`/api/chargers/${bens.charger.id}/slots`).set(authHeader(anna)).send({ date: '2030-01-01' }),
      request(app).post('/api/operator/slots/top-up').set(authHeader(anna)).send({ stationId: bens.station.id }),
    ];
    for (const res of await Promise.all(edits)) expect(res.status).toBe(403);
    expect((await db('stations').where({ id: bens.station.id }).first()).name).toBe("Ben's Station");
  });
});
