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
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

describe('GET /api/stations', () => {
  it('lists stations with their chargers nested', async () => {
    const { station, charger } = await createScenario();

    const res = await request(app).get('/api/stations');

    expect(res.status).toBe(200);
    expect(res.body.stations).toHaveLength(1);
    expect(res.body.stations[0].id).toBe(station.id);
    expect(res.body.stations[0].chargers.map((c) => c.id)).toEqual([charger.id]);
  });

  it('filters by charger status', async () => {
    const { operator } = await createScenario();
    const offlineStation = await createStation(operator.id, { name: 'Offline Station' });
    await createCharger(offlineStation.id, { status: 'offline' });

    const res = await request(app).get('/api/stations?status=online');

    expect(res.body.stations.map((s) => s.name)).toEqual(['Test Station']);
  });

  it('filters by connector type', async () => {
    const { operator } = await createScenario();
    const acStation = await createStation(operator.id, { name: 'AC Station' });
    await createCharger(acStation.id, { connector_type: 'Type2_AC', power_kw: 22 });

    const res = await request(app).get('/api/stations?connectorType=Type2_AC');

    expect(res.body.stations.map((s) => s.name)).toEqual(['AC Station']);
  });

  it('filters by price range', async () => {
    const { operator } = await createScenario(); // charger at 200/kWh
    const cheap = await createStation(operator.id, { name: 'Cheap Station' });
    await createCharger(cheap.id, { price_per_kwh: 120 });
    const pricey = await createStation(operator.id, { name: 'Pricey Station' });
    await createCharger(pricey.id, { price_per_kwh: 300 });

    const res = await request(app).get('/api/stations?minPrice=100&maxPrice=210');

    expect(res.body.stations.map((s) => s.name).sort()).toEqual(['Cheap Station', 'Test Station']);
  });

  it('sorts by distance and applies the radius when lat/lng are given', async () => {
    const { operator } = await createScenario(); // at 6.45, 3.42
    const near = await createStation(operator.id, { name: 'Near', lat: 6.451, lng: 3.421 });
    await createCharger(near.id);
    const far = await createStation(operator.id, { name: 'Far', lat: 6.65, lng: 3.35 });
    await createCharger(far.id);

    const res = await request(app).get('/api/stations?lat=6.45&lng=3.42&radiusKm=10');

    const names = res.body.stations.map((s) => s.name);
    expect(names).toEqual(['Test Station', 'Near']); // 'Far' is >20km away
    expect(res.body.stations[0].distanceKm).toBeLessThanOrEqual(res.body.stations[1].distanceKm);
  });
});

describe('GET /api/stations/:id', () => {
  it('returns the station with per-charger open slot counts', async () => {
    const { station, charger } = await createScenario(); // 3 available future slots
    await createSlot(charger.id, futureTime(1, 13), { status: 'blocked' });

    const res = await request(app).get(`/api/stations/${station.id}`);

    expect(res.status).toBe(200);
    expect(res.body.station.name).toBe('Test Station');
    expect(res.body.station.chargers[0].availableSlotCount).toBe(3);
  });

  it('returns 404 for an unknown station', async () => {
    const res = await request(app).get('/api/stations/99999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/stations', () => {
  const payload = { name: 'New Hub', address: '5 Marina, Lagos', lat: 6.45, lng: 3.39 };

  it('lets an operator create a station they own', async () => {
    const { operator } = await createScenario();

    const res = await request(app).post('/api/stations').set(authHeader(operator)).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.station.owner_id).toBe(operator.id);
    expect(res.body.station.name).toBe('New Hub');
  });

  it('rejects a driver with 403', async () => {
    const { driver } = await createScenario();
    const res = await request(app).post('/api/stations').set(authHeader(driver)).send(payload);
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/stations').send(payload);
    expect(res.status).toBe(401);
  });

  it('rejects invalid input with 400', async () => {
    const { operator } = await createScenario();
    const res = await request(app)
      .post('/api/stations')
      .set(authHeader(operator))
      .send({ ...payload, name: '', lat: 999 });
    expect(res.status).toBe(400);
  });
});

describe('station and charger ownership', () => {
  it("stops an operator editing another operator's station", async () => {
    const { station, otherOperator } = await createScenario();

    const res = await request(app)
      .put(`/api/stations/${station.id}`)
      .set(authHeader(otherOperator))
      .send({ name: 'Hijacked', address: 'x', lat: 6.4, lng: 3.4 });

    expect(res.status).toBe(403);
  });

  it('lets the owner add a charger and change its status', async () => {
    const { station, operator } = await createScenario();

    const created = await request(app)
      .post(`/api/stations/${station.id}/chargers`)
      .set(authHeader(operator))
      .send({ connectorType: 'Type2_AC', powerKw: 22, pricePerKwh: 150 });
    expect(created.status).toBe(201);
    expect(created.body.charger.status).toBe('online');

    const updated = await request(app)
      .patch(`/api/chargers/${created.body.charger.id}/status`)
      .set(authHeader(operator))
      .send({ status: 'offline' });
    expect(updated.status).toBe(200);
    expect(updated.body.charger.status).toBe('offline');
  });

  it('lets the owner change a charger price without touching its status', async () => {
    const { charger, operator } = await createScenario();

    const res = await request(app)
      .put(`/api/chargers/${charger.id}`)
      .set(authHeader(operator))
      .send({ connectorType: charger.connector_type, powerKw: charger.power_kw, pricePerKwh: 275 });

    expect(res.status).toBe(200);
    expect(Number(res.body.charger.price_per_kwh)).toBe(275);
    expect(res.body.charger.status).toBe('online');
  });

  it('rejects an invalid charger status and a non-owner status change', async () => {
    const { charger, operator, otherOperator } = await createScenario();

    const invalid = await request(app)
      .patch(`/api/chargers/${charger.id}/status`)
      .set(authHeader(operator))
      .send({ status: 'exploded' });
    expect(invalid.status).toBe(400);

    const forbidden = await request(app)
      .patch(`/api/chargers/${charger.id}/status`)
      .set(authHeader(otherOperator))
      .send({ status: 'offline' });
    expect(forbidden.status).toBe(403);
  });
});
