// Regression tests for the 2026-09-24 full-app test findings (Phase 1: safety and robustness).
// Several of these only ever failed on Postgres (SQLite accepts almost anything), so run this
// file with TEST_DATABASE_URL as well as on SQLite.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { hashPassword } = require('../src/utils/password');
const loginThrottle = require('../src/utils/loginThrottle');
const { clientErrorFromDb } = require('../src/utils/dbErrors');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createAdmin,
  createUser,
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

const HOUR = 60 * 60 * 1000;
const book = (user, slotId) => request(app).post('/api/bookings').set(authHeader(user)).send({ slotId });
const login = (email, password, ip = '203.0.113.1') =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email, password });
const signup = (fields = {}) =>
  request(app)
    .post('/api/auth/signup')
    .send({ name: 'Ada Driver', email: 'ada@test.dev', password: 'first-password', role: 'driver', ...fields });

// ------------------------------------------------------------- bad input is a 4xx, never a 500

describe('malformed ids and values are 400s, not 500s', () => {
  it('rejects non-numeric, fractional and out-of-range ids in the URL', async () => {
    const { driver, operator } = await createScenario();
    const cases = [
      ['get', '/api/stations/abc'],
      ['get', '/api/stations/1.5'],
      ['get', '/api/stations/99999999999'],
      ['get', '/api/stations/-1'],
      ['get', '/api/chargers/abc/slots'],
      ['get', '/api/chargers/99999999999/slots'],
    ];
    for (const [method, url] of cases) {
      const res = await request(app)[method](url);
      expect([url, res.status]).toEqual([url, 400]);
      expect(res.body.error).toMatch(/id must be a positive whole number/);
    }

    expect((await request(app).get('/api/bookings/abc').set(authHeader(driver))).status).toBe(400);
    expect((await request(app).patch('/api/bookings/abc/cancel').set(authHeader(driver))).status).toBe(400);
    expect((await request(app).patch('/api/bookings/99999999999/cancel').set(authHeader(driver))).status).toBe(400);
    expect((await request(app).patch('/api/slots/abc').set(authHeader(operator)).send({ status: 'blocked' })).status).toBe(400);
    expect((await request(app).delete('/api/slots/1e3').set(authHeader(operator))).status).toBe(400);
    expect((await request(app).put('/api/chargers/abc').set(authHeader(operator)).send({})).status).toBe(400);
    expect((await request(app).patch('/api/admin/users/99999999999').set(authHeader(await createAdmin())).send({ isActive: false })).status).toBe(400);
  });

  it('rejects a slotId that is not a whole number in range, and books nothing', async () => {
    const { driver } = await createScenario();
    for (const slotId of [99999999999, 'abc', 1.5, [1], { id: 1 }, null, 0]) {
      const res = await book(driver, slotId);
      expect([slotId, res.status]).toEqual([slotId, 400]);
    }
    expect(await db('bookings')).toHaveLength(0);
  });

  it('rejects over-long names and addresses (Postgres VARCHAR(255) used to 500)', async () => {
    const { operator } = await createScenario();
    const long = 'x'.repeat(256);
    const station = (fields) =>
      request(app)
        .post('/api/stations')
        .set(authHeader(operator))
        .send({ name: 'Fine', address: 'Fine street', lat: 6.5, lng: 3.4, ...fields });

    expect((await station({ name: long })).status).toBe(400);
    expect((await station({ name: 'x'.repeat(121) })).body.error).toMatch(/Name must be 120 characters or fewer/);
    expect((await station({ address: long })).status).toBe(400);
    expect((await station({ name: 'x'.repeat(120), address: 'y'.repeat(255) })).status).toBe(201);

    expect((await signup({ name: long })).status).toBe(400);
    expect((await signup({ email: `${'a'.repeat(250)}@test.dev` })).status).toBe(400);
    expect((await request(app).patch('/api/auth/me').set(authHeader(operator)).send({ name: long })).status).toBe(400);
  });

  it('rejects text sent as an object or array instead of storing "[object Object]"', async () => {
    const { operator } = await createScenario();
    expect((await signup({ name: { first: 'Ada' } })).status).toBe(400);
    expect((await signup({ email: ['ada@test.dev'] })).status).toBe(400);
    expect((await request(app).patch('/api/auth/me').set(authHeader(operator)).send({ name: { a: 1 } })).status).toBe(400);
    const res = await request(app)
      .post('/api/stations')
      .set(authHeader(operator))
      .send({ name: { evil: true }, address: ['a'], lat: 6.5, lng: 3.4 });
    expect(res.status).toBe(400);

    expect(await db('users').where('name', 'like', '%object%')).toHaveLength(0);
    expect(await db('stations').where('name', 'like', '%object%')).toHaveLength(0);
  });

  it('bounds charger power and price: no 0, negative or absurd values (1e10 overflowed DECIMAL)', async () => {
    const { operator, station } = await createScenario();
    const add = (fields) =>
      request(app)
        .post(`/api/stations/${station.id}/chargers`)
        .set(authHeader(operator))
        .send({ connectorType: 'CCS2_DC', powerKw: 50, pricePerKwh: 200, ...fields });

    for (const fields of [{ powerKw: 1e10 }, { pricePerKwh: 1e10 }, { powerKw: 0 }, { pricePerKwh: 0 }, { powerKw: -5 }, { powerKw: '50kW' }, { pricePerKwh: { n: 1 } }, { powerKw: [50] }, { connectorType: ['CCS2_DC'] }]) {
      const res = await add(fields);
      expect([fields, res.status]).toEqual([fields, 400]);
    }
    expect((await add({ powerKw: 1000, pricePerKwh: 100000 })).status).toBe(201);
    expect((await add({ powerKw: '7.4', pricePerKwh: '150.50' })).body.charger).toMatchObject({ power_kw: 7.4, price_per_kwh: 150.5 });
  });

  it('only generates slots from today up to 90 days ahead (year 9999 used to be accepted)', async () => {
    const { operator, charger } = await createScenario();
    const generate = (date) => request(app).post(`/api/chargers/${charger.id}/slots`).set(authHeader(operator)).send({ date });

    const yesterday = appDateString(futureTime(-1, 12));
    for (const date of ['9999-01-01', yesterday, appDateString(futureTime(91, 12)), '2026-02-30', { d: 1 }]) {
      const res = await generate(date);
      expect([date, res.status]).toEqual([date, 400]);
    }
    expect((await generate(appDateString(futureTime(90, 12)))).status).toBe(201);
  });

  it('never creates a slot that has already started when generating for today', async () => {
    const { operator, charger } = await createScenario();
    const today = appDateString(new Date());
    const res = await request(app)
      .post(`/api/chargers/${charger.id}/slots`)
      .set(authHeader(operator))
      .send({ date: today, startHour: 0, endHour: 24, durationMinutes: 60 });

    expect(res.status).toBe(201);
    for (const slot of res.body.slots) expect(new Date(slot.start_time).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('validates list filters instead of passing them to the database', async () => {
    const { operator } = await createScenario();
    for (const query of ['status=bogus', 'status=online&status=offline', 'connectorType=USB', 'lat=abc', 'lat=91', 'lat=6&lat=7', 'maxPrice=cheap', 'radiusKm=-1']) {
      const res = await request(app).get(`/api/stations?${query}`);
      expect([query, res.status]).toEqual([query, 400]);
    }
    expect((await request(app).get('/api/stations?lat=6.5&lng=3.4&radiusKm=50&status=online')).status).toBe(200);
    for (const query of ['stationId=abc', 'stationId=1&stationId=2', 'chargerId=99999999999', 'status=maybe']) {
      const res = await request(app).get(`/api/operator/bookings?${query}`).set(authHeader(operator));
      expect([query, res.status]).toEqual([query, 400]);
    }
  });

  it('answers malformed JSON with 400 and an oversized body with 413, both as JSON', async () => {
    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/not valid JSON/);

    const huge = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.dev', password: 'x'.repeat(110 * 1024) }));
    expect(huge.status).toBe(413);
    expect(huge.body.error).toMatch(/too large/);
  });

  it('turns a database data error that slips past validation into a 4xx', () => {
    expect(clientErrorFromDb({ code: '22P02' })).toMatchObject({ status: 400 }); // invalid integer text
    expect(clientErrorFromDb({ code: '22003' })).toMatchObject({ status: 400 }); // numeric out of range
    expect(clientErrorFromDb({ code: '22001' })).toMatchObject({ status: 400 }); // string too long
    expect(clientErrorFromDb({ code: '23505' })).toMatchObject({ status: 409 });
    expect(clientErrorFromDb({ code: 'SQLITE_CONSTRAINT_CHECK' })).toMatchObject({ status: 400 });
    expect(clientErrorFromDb({ code: 'ECONNREFUSED' })).toBeNull();
    expect(clientErrorFromDb(new Error('boom'))).toBeNull();
  });
});

// ------------------------------------------------------------------------- login throttling

describe('login throttling', () => {
  it('locks an email+IP after 10 failures with 429 and Retry-After, even for the right password', async () => {
    await signup();
    for (let i = 0; i < 10; i += 1) {
      expect((await login('ada@test.dev', 'wrong-password')).status).toBe(401);
    }

    const locked = await login('ada@test.dev', 'first-password');
    expect(locked.status).toBe(429);
    const retryAfter = Number(locked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(locked.body.error).toMatch(/Too many failed login attempts/);
    expect(locked.body).not.toHaveProperty('token');

    // Other IPs, and other emails from this IP, are not affected.
    expect((await login('ada@test.dev', 'first-password', '198.51.100.7')).status).toBe(200);
    expect((await login('someone@test.dev', 'whatever', '203.0.113.1')).status).toBe(401);
  });

  it('treats an unknown email exactly like a wrong password, including the lockout', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await login('nobody@test.dev', 'guess');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    }
    expect((await login('nobody@test.dev', 'guess')).status).toBe(429);
  });

  it('does the same bcrypt work for an unknown email as for a known one (no timing tell)', async () => {
    await signup();
    const compare = jest.spyOn(bcrypt, 'compare');
    try {
      await login('ada@test.dev', 'wrong-password');
      await login('nobody@test.dev', 'wrong-password');
      expect(compare).toHaveBeenCalledTimes(2);
    } finally {
      compare.mockRestore();
    }
  });

  it('counts emails case-insensitively, and a successful login clears the count', async () => {
    await signup();
    for (let i = 0; i < 9; i += 1) await login(i % 2 ? 'ADA@test.dev' : 'ada@test.dev', 'wrong-password');
    expect((await login('Ada@Test.dev', 'first-password')).status).toBe(200);
    for (let i = 0; i < 9; i += 1) expect((await login('ada@test.dev', 'wrong-password')).status).toBe(401);
    expect((await login('ada@test.dev', 'first-password')).status).toBe(200);
  });

  it('lets attempts through again once the 15-minute window has passed', () => {
    const start = 1_000_000;
    for (let i = 0; i < 10; i += 1) loginThrottle.recordFailure('x@test.dev', '1.2.3.4', start + i * 1000);
    expect(loginThrottle.retryAfterSeconds('x@test.dev', '1.2.3.4', start + 10_000)).toBe(15 * 60 - 10);
    expect(loginThrottle.retryAfterSeconds('x@test.dev', '1.2.3.4', start + loginThrottle.WINDOW_MS)).toBe(0);
  });
});

// ---------------------------------------------------------------------------- email case

describe('emails are case-insensitive', () => {
  it('stores emails lower-case, refuses a sign-up that differs only by case, and logs in with any case', async () => {
    const first = await signup({ email: 'Ada.Obi@Test.DEV' });
    expect(first.status).toBe(201);
    expect(first.body.user.email).toBe('ada.obi@test.dev');

    const dup = await signup({ email: 'ada.obi@test.dev' });
    expect(dup.status).toBe(409);

    expect((await login('ADA.OBI@TEST.DEV', 'first-password')).status).toBe(200);
    expect((await login('ada.obi@test.dev', 'first-password')).status).toBe(200);
  });

  it('applies to accounts created and edited by an admin', async () => {
    const boss = await createAdmin();
    await signup({ email: 'taken@test.dev' });
    const adminCall = (method, url, body) => request(app)[method](`/api/admin${url}`).set(authHeader(boss)).send(body);

    const created = await adminCall('post', '/users', { name: 'New', email: 'New.Person@Test.dev', role: 'driver', password: 'welcome-2026' });
    expect(created.body.user.email).toBe('new.person@test.dev');
    expect((await adminCall('post', '/users', { name: 'Copy', email: 'TAKEN@test.dev', role: 'driver', password: 'welcome-2026' })).status).toBe(409);
    expect((await adminCall('put', `/users/${created.body.user.id}`, { name: 'New', email: 'Taken@Test.dev', role: 'driver' })).status).toBe(409);
  });

  it('is enforced by the database too (unique index on lower(email))', async () => {
    await createUser({ name: 'A', email: 'same@test.dev', role: 'driver' });
    await expect(createUser({ name: 'B', email: 'SAME@test.dev', role: 'driver' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------- passwords

describe('password rules', () => {
  it('requires at least 8 characters at sign-up, but older shorter passwords still log in', async () => {
    const short = await signup({ password: 'abc1234' });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/at least 8 characters/);
    expect((await signup({ password: 'abcd1234' })).status).toBe(201);

    await createUser({ name: 'Old', email: 'old@test.dev', role: 'driver', password_hash: await hashPassword('abc123') });
    expect((await login('old@test.dev', 'abc123')).status).toBe(200);
  });
});

// ------------------------------------------------------------------------ revocable sessions

describe('sessions end when the password or role changes', () => {
  const me = (token) => request(app).get('/api/auth/me').set({ Authorization: `Bearer ${token}` });

  it('a password change ends other sessions, and the caller gets a fresh token that works', async () => {
    const { body } = await signup();
    const otherDevice = (await login('ada@test.dev', 'first-password')).body.token;

    const res = await request(app)
      .post('/api/auth/change-password')
      .set({ Authorization: `Bearer ${body.token}` })
      .send({ currentPassword: 'first-password', newPassword: 'second-password' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect((await me(body.token)).status).toBe(401);
    expect((await me(otherDevice)).status).toBe(401);
    expect((await me(res.body.token)).status).toBe(200);
  });

  it('an admin password reset ends the user’s sessions', async () => {
    const boss = await createAdmin();
    const { body } = await signup();
    expect((await me(body.token)).status).toBe(200);

    await request(app).post(`/api/admin/users/${body.user.id}/reset-password`).set(authHeader(boss)).send({ reason: 'User asked for it' });

    expect((await me(body.token)).status).toBe(401);
  });

  it('a revoked token gets the public view on public pages, like any invalid token', async () => {
    const { station } = await createScenario();
    const { body } = await signup();
    await db('users').where({ id: body.user.id }).update({ token_version: 5 });

    const res = await request(app).get(`/api/stations/${station.id}`).set({ Authorization: `Bearer ${body.token}` });
    expect(res.status).toBe(200);
  });

  it('tokens issued before token versions existed (no tv claim) still work until the first bump', async () => {
    const { driver } = await createScenario();
    expect((await request(app).get('/api/bookings/me').set(authHeader(driver))).status).toBe(200); // helper tokens carry no tv
    await db('users').where({ id: driver.id }).update({ token_version: 1 });
    expect((await request(app).get('/api/bookings/me').set(authHeader(driver))).status).toBe(401);
  });
});

// -------------------------------------------------------------------------------- bookings

describe('booking rules', () => {
  it('refuses a slot that started days ago, or minutes ago, and leaves it untouched', async () => {
    const { driver, charger } = await createScenario();
    const longGone = await createSlot(charger.id, new Date(Date.now() - 2 * 24 * HOUR));
    const inProgress = await createSlot(charger.id, new Date(Date.now() - 10 * 60 * 1000));

    for (const slot of [longGone, inProgress]) {
      const res = await book(driver, slot.id);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already started/);
      expect((await db('slots').where({ id: slot.id }).first()).status).toBe('available');
    }
    expect(await db('bookings')).toHaveLength(0);
  });

  it('refuses a second confirmed booking that overlaps one the driver already has', async () => {
    const { driver, otherDriver, operator, slots } = await createScenario();
    const elsewhere = await createCharger((await createStation(operator.id, { name: 'Elsewhere' })).id);
    const sameHour = await createSlot(elsewhere.id, futureTime(1, 10));
    const halfPast = await createSlot(elsewhere.id, new Date(futureTime(1, 10).getTime() + HOUR / 2), {
      end_time: new Date(futureTime(1, 11).getTime()).toISOString(),
    });

    const first = await book(driver, slots[0].id); // 10:00-11:00
    expect(first.status).toBe(201);

    const clash = await book(driver, sameHour.id);
    expect(clash.status).toBe(409);
    expect(clash.body.error).toContain(first.body.booking.booking_reference);
    expect((await book(driver, halfPast.id)).status).toBe(409);
    expect((await db('slots').where({ id: sameHour.id }).first()).status).toBe('available');

    expect((await book(driver, slots[1].id)).status).toBe(201); // 11:00 touches but doesn't overlap
    expect((await book(otherDriver, sameHour.id)).status).toBe(201); // another driver is unaffected

    // A cancelled booking no longer blocks: 10:30-11:00 is now free for this driver.
    await request(app).patch(`/api/bookings/${first.body.booking.id}/cancel`).set(authHeader(driver));
    expect((await book(driver, halfPast.id)).status).toBe(201);
  });
});

// --------------------------------------------------------------------- suspended operators

describe("a suspended operator's stations", () => {
  it('disappear from the map, detail and slot lists and cannot be booked; existing bookings stay and admins can cancel', async () => {
    const { driver, operator, station, charger, slots } = await createScenario();
    const existing = await book(driver, slots[0].id);
    expect(existing.status).toBe(201);
    await db('users').where({ id: operator.id }).update({ is_active: false });

    expect((await request(app).get('/api/stations')).body.stations).toHaveLength(0);
    expect((await request(app).get(`/api/stations/${station.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/chargers/${charger.id}/slots`)).body.slots).toEqual([]);
    const res = await book(driver, slots[1].id);
    expect(res.status).toBe(409);
    expect((await db('slots').where({ id: slots[1].id }).first()).status).toBe('available');

    expect((await db('bookings').where({ id: existing.body.booking.id }).first()).status).toBe('confirmed');
    const boss = await createAdmin();
    const cancel = await request(app)
      .patch(`/api/admin/bookings/${existing.body.booking.id}/cancel`)
      .set(authHeader(boss))
      .send({ reason: 'Operator suspended' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.booking.status).toBe('cancelled');

    const adminStations = await request(app).get('/api/admin/stations').set(authHeader(boss));
    expect(adminStations.body.stations[0]).toMatchObject({ id: station.id, owner_active: false });

    await db('users').where({ id: operator.id }).update({ is_active: true });
    expect((await request(app).get('/api/stations')).body.stations).toHaveLength(1);
    expect((await book(driver, slots[1].id)).status).toBe(201);
  });

  it('are left out of the utilisation capacity', async () => {
    const { operator } = await createScenario();
    const boss = await createAdmin();
    const openSlots = async () => (await request(app).get('/api/admin/overview').set(authHeader(boss))).body.overview.utilisation.open;

    expect(await openSlots()).toBe(3);
    await db('users').where({ id: operator.id }).update({ is_active: false });
    expect(await openSlots()).toBe(0);
  });
});

// ------------------------------------------------------------------------ headers and seeds

describe('HTTP hardening', () => {
  it('sends security headers and hides X-Powered-By, on success and on errors', async () => {
    for (const url of ['/health', '/api/nope', '/api/stations/abc']) {
      const res = await request(app).get(url);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['content-security-policy']).toMatch(/default-src 'none'/);
    }
  });
});

describe('destructive seed guard', () => {
  const seed = require('../src/db/seeds/01_users');
  const saved = { NODE_ENV: process.env.NODE_ENV, ALLOW: process.env.ALLOW_DESTRUCTIVE_SEED };
  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.ALLOW === undefined) delete process.env.ALLOW_DESTRUCTIVE_SEED;
    else process.env.ALLOW_DESTRUCTIVE_SEED = saved.ALLOW;
  });

  it('refuses to wipe a production database, touching nothing', async () => {
    const knex = jest.fn(() => {
      throw new Error('the seed touched the database');
    });
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DESTRUCTIVE_SEED;
    await expect(seed.seed(knex)).rejects.toThrow(/Refusing to run the full seed/);
    process.env.ALLOW_DESTRUCTIVE_SEED = 'true'; // only the exact word "yes" counts
    await expect(seed.seed(knex)).rejects.toThrow(/Refusing to run the full seed/);
    expect(knex).not.toHaveBeenCalled();
  });

  it('runs in production only with ALLOW_DESTRUCTIVE_SEED=yes', async () => {
    const del = jest.fn().mockRejectedValue(new Error('stop here'));
    const knex = jest.fn(() => ({ del }));
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DESTRUCTIVE_SEED = 'yes';
    await expect(seed.seed(knex)).rejects.toThrow('stop here');
    expect(del).toHaveBeenCalled();
  });
});
