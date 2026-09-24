const request = require('supertest');
const app = require('../src/app');
const adminService = require('../src/modules/admin/admin.service');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createUser,
  createAdmin,
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

const as = (user) => authHeader(user);
const get = (user, path) => request(app).get(`/api/admin${path}`).set(as(user));
const REASON = 'Checked with the account owner';
const withReason = (body) => (body && typeof body === 'object' && !('reason' in body) ? { ...body, reason: REASON } : body);
const patch = (user, path, body) => request(app).patch(`/api/admin${path}`).set(as(user)).send(withReason(body));
const post = (user, path, body) => request(app).post(`/api/admin${path}`).set(as(user)).send(withReason(body));
const book = (user, slotId) => request(app).post('/api/bookings').set(as(user)).send({ slotId });

// Admin entries from audit_log, with the old "<type>:<id>" target rebuilt for readability.
async function auditRows() {
  const rows = await db('audit_log').where('actor_role', 'admin').orderBy('id');
  return rows.map((row) => ({
    ...row,
    admin_id: row.actor_id,
    target: row.target_type === 'chargers' ? 'chargers:all' : `${row.target_type}:${row.target_id}`,
  }));
}

describe('access control', () => {
  // Every row has a body slot (null for GETs): jest-each treats a callback with more
  // parameters than the row has values as expecting a `done` callback.
  const routes = [
    ['get', '/overview', null],
    ['get', '/users', null],
    ['patch', '/users/1', { isActive: false }],
    ['post', '/users', { name: 'X', email: 'x@test.dev', role: 'driver', password: 'long-enough' }],
    ['put', '/users/1', { name: 'X', email: 'x@test.dev', role: 'driver' }],
    ['post', '/users/1/reset-password', {}],
    ['get', '/stations', null],
    ['patch', '/stations/1', { isActive: false }],
    ['patch', '/chargers/1/status', { status: 'offline' }],
    ['get', '/bookings', null],
    ['patch', '/bookings/1/cancel', { reason: 'test reason' }],
    ['get', '/slot-coverage', null],
    ['post', '/slots/top-up', { days: 1 }],
    ['get', '/audit-log', null],
  ];

  it.each(routes)('%s /api/admin%s is 401 without a token, 403 for a driver and for an operator', async (method, path, body) => {
    const { driver, operator } = await createScenario();
    const send = (req) => (body ? req.send(body) : req);
    const url = `/api/admin${path}`;

    expect((await send(request(app)[method](url))).status).toBe(401);
    expect((await send(request(app)[method](url).set(as(driver)))).status).toBe(403);
    expect((await send(request(app)[method](url).set(as(operator)))).status).toBe(403);
  });

  it('403s before touching data: a driver cannot suspend anyone', async () => {
    const { driver, operator } = await createScenario();

    await patch(driver, `/users/${operator.id}`, { isActive: false });

    expect((await db('users').where({ id: operator.id }).first()).is_active).toBeTruthy();
    expect(await auditRows()).toHaveLength(0);
  });

  it('cannot be reached by signing up as an admin', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Sneaky', email: 'sneaky@test.dev', password: 'password123', role: 'admin' });

    expect(res.status).toBe(400);
    expect(await db('users').where({ email: 'sneaky@test.dev' })).toHaveLength(0);
  });
});

describe('users', () => {
  it('lists users without password hashes, and filters by role and search text', async () => {
    const { driver, operator } = await createScenario();
    const admin = await createAdmin();

    const all = await get(admin, '/users');
    expect(all.status).toBe(200);
    expect(all.body.users).toHaveLength(5); // 2 operators, 2 drivers, 1 admin
    expect(all.body.users[0]).not.toHaveProperty('password_hash');
    expect(all.body.users.find((u) => u.id === driver.id)).toMatchObject({
      name: 'Driver One',
      email: 'driver1@test.dev',
      role: 'driver',
      is_active: true,
    });

    const operators = await get(admin, '/users?role=operator');
    expect(operators.body.users.map((u) => u.email).sort()).toEqual(['op1@test.dev', 'op2@test.dev']);

    const search = await get(admin, '/users?q=DRIVER%20ONE');
    expect(search.body.users.map((u) => u.id)).toEqual([driver.id]);
    const byEmail = await get(admin, `/users?q=${operator.email.slice(0, 3)}`);
    expect(byEmail.body.users.map((u) => u.id)).toContain(operator.id);

    expect((await get(admin, '/users?role=root')).status).toBe(400);
  });

  it('pages the list, with the total that matches the filters', async () => {
    await createScenario(); // 2 operators, 2 drivers
    const admin = await createAdmin();

    const first = await get(admin, '/users?pageSize=2');
    expect(first.body).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    const second = await get(admin, '/users?pageSize=2&page=3');
    expect(second.body.users).toHaveLength(1);
    expect(second.body.users[0].id).toBe(admin.id);
    expect((await get(admin, '/users?role=driver&pageSize=1')).body).toMatchObject({ total: 2, pageSize: 1 });
    expect((await get(admin, '/users')).body.pageSize).toBe(50);
    expect((await get(admin, '/users?pageSize=101')).status).toBe(400);
    expect((await get(admin, '/users?page=0')).status).toBe(400);
  });

  it('treats empty filters (what a cleared filter box sends) as no filter', async () => {
    const { driver } = await createScenario();
    const admin = await createAdmin();
    await book(driver, (await db('slots').first()).id);

    expect((await get(admin, '/users?role=&q=')).body.users).toHaveLength(5);
    expect((await get(admin, '/bookings?status=&stationId=&date=')).body.bookings).toHaveLength(1);
  });

  it('treats % and _ in the search text literally', async () => {
    const admin = await createAdmin();
    await createUser({ name: 'Plain Person', email: 'plain@test.dev', role: 'driver' });

    expect((await get(admin, '/users?q=%25')).body.users).toHaveLength(0);
    expect((await get(admin, '/users?q=_')).body.users).toHaveLength(0);
  });

  it('suspends and reactivates a user, writing an audit entry for each', async () => {
    const { driver } = await createScenario();
    const admin = await createAdmin();

    const suspended = await patch(admin, `/users/${driver.id}`, { isActive: false });
    expect(suspended.status).toBe(200);
    expect(suspended.body.user).toMatchObject({ id: driver.id, is_active: false });

    const reactivated = await patch(admin, `/users/${driver.id}`, { isActive: true });
    expect(reactivated.body.user.is_active).toBe(true);

    const rows = await auditRows();
    expect(rows.map((r) => [r.admin_id, r.action, r.target])).toEqual([
      [admin.id, 'user.suspend', `user:${driver.id}`],
      [admin.id, 'user.reactivate', `user:${driver.id}`],
    ]);
  });

  it('does not log an action when nothing changed', async () => {
    const { driver } = await createScenario();
    const admin = await createAdmin();

    const res = await patch(admin, `/users/${driver.id}`, { isActive: true });

    expect(res.status).toBe(200);
    expect(await auditRows()).toHaveLength(0);
  });

  it('validates the body and the target', async () => {
    const { driver } = await createScenario();
    const admin = await createAdmin();

    expect((await patch(admin, `/users/${driver.id}`, {})).status).toBe(400);
    expect((await patch(admin, `/users/${driver.id}`, { isActive: 'false' })).status).toBe(400); // not a real boolean
    expect((await patch(admin, '/users/abc', { isActive: false })).status).toBe(400);
    expect((await patch(admin, '/users/99999', { isActive: false })).status).toBe(404);
  });

  it('refuses to let an admin change their own status', async () => {
    const admin = await createAdmin();
    await createAdmin({ email: 'admin2@test.dev' });

    const res = await patch(admin, `/users/${admin.id}`, { isActive: false });

    expect(res.status).toBe(400);
    expect((await db('users').where({ id: admin.id }).first()).is_active).toBeTruthy();
  });

  it('lets an admin suspend another admin while one stays active', async () => {
    const admin = await createAdmin();
    const other = await createAdmin({ email: 'admin2@test.dev' });

    const res = await patch(admin, `/users/${other.id}`, { isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.user.is_active).toBe(false);
  });
});

describe('last-admin protection', () => {
  it('refuses to suspend the only active admin, whoever asks', async () => {
    const soleAdmin = await createAdmin();
    // A second admin who is already suspended (e.g. their request was authenticated a
    // moment before they were suspended) must not be able to take the last one out.
    const suspendedAdmin = await createAdmin({ email: 'admin2@test.dev', is_active: false });

    await expect(adminService.setUserActive(suspendedAdmin.id, soleAdmin.id, false, REASON)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/last active admin/i),
    });

    expect((await db('users').where({ id: soleAdmin.id }).first()).is_active).toBeTruthy();
    expect(await auditRows()).toHaveLength(0);
  });

  it('still allows suspending an admin when another active admin remains', async () => {
    const admin = await createAdmin();
    const other = await createAdmin({ email: 'admin2@test.dev' });

    await expect(adminService.setUserActive(admin.id, other.id, false, REASON)).resolves.toMatchObject({ is_active: false });
  });

  it('two admins suspending each other at the same time never leaves zero active admins', async () => {
    const a = await createAdmin({ email: 'a@test.dev' });
    const b = await createAdmin({ email: 'b@test.dev' });

    const results = await Promise.all([patch(a, `/users/${b.id}`, { isActive: false }), patch(b, `/users/${a.id}`, { isActive: false })]);

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 403 || s === 409)).toHaveLength(1);
    const active = await db('users').where({ role: 'admin', is_active: true });
    expect(active).toHaveLength(1);
  });
});

describe('stations and chargers', () => {
  it('lists every station with its owner and chargers, including inactive ones', async () => {
    const { operator, station, charger } = await createScenario();
    const admin = await createAdmin();
    const hidden = await createStation(operator.id, { name: 'Hidden Station', is_active: false });

    const res = await get(admin, '/stations');

    expect(res.status).toBe(200);
    expect(res.body.stations.map((s) => s.id)).toEqual([station.id, hidden.id]);
    expect(res.body.stations[0]).toMatchObject({
      name: 'Test Station',
      owner_name: 'Op One',
      owner_email: 'op1@test.dev',
      is_active: true,
    });
    expect(res.body.stations[0].chargers.map((c) => c.id)).toEqual([charger.id]);
    expect(res.body.stations[1].is_active).toBe(false);
  });

  it('deactivates and reactivates a station with audit entries', async () => {
    const { station } = await createScenario();
    const admin = await createAdmin();

    const off = await patch(admin, `/stations/${station.id}`, { isActive: false });
    const on = await patch(admin, `/stations/${station.id}`, { isActive: true });

    expect(off.body.station.is_active).toBe(false);
    expect(on.body.station.is_active).toBe(true);
    expect((await auditRows()).map((r) => [r.action, r.target])).toEqual([
      ['station.deactivate', `station:${station.id}`],
      ['station.activate', `station:${station.id}`],
    ]);
    expect((await patch(admin, '/stations/99999', { isActive: false })).status).toBe(404);
    expect((await patch(admin, `/stations/${station.id}`, { isActive: 1 })).status).toBe(400);
  });

  it('sets a charger status, which immediately stops bookings, and logs it', async () => {
    const { driver, charger, slots } = await createScenario();
    const admin = await createAdmin();

    const res = await patch(admin, `/chargers/${charger.id}/status`, { status: 'offline' });

    expect(res.status).toBe(200);
    expect(res.body.charger.status).toBe('offline');
    expect((await book(driver, slots[0].id)).status).toBe(409);
    const entries = await auditRows();
    expect(entries.map((r) => [r.action, r.target])).toEqual([['charger.status', `charger:${charger.id}`]]);
    expect(JSON.parse(entries[0].changes)).toEqual({ status: { from: 'online', to: 'offline' } });
  });

  it('validates the charger status and target', async () => {
    const { charger } = await createScenario();
    const admin = await createAdmin();

    expect((await patch(admin, `/chargers/${charger.id}/status`, { status: 'exploded' })).status).toBe(400);
    expect((await patch(admin, '/chargers/99999/status', { status: 'offline' })).status).toBe(404);
  });
});

describe('bookings', () => {
  async function bookedScenario() {
    const scenario = await createScenario();
    const admin = await createAdmin();
    const first = await book(scenario.driver, scenario.slots[0].id);
    const second = await book(scenario.otherDriver, scenario.slots[1].id);
    return { ...scenario, admin, first: first.body.booking, second: second.body.booking };
  }

  it('lists all bookings with driver and station details, and filters them', async () => {
    const { admin, driver, operator, first, second } = await bookedScenario();
    const otherStation = await createStation(operator.id, { name: 'Elsewhere' });
    const otherCharger = await createCharger(otherStation.id);
    const elsewhereSlot = await createSlot(otherCharger.id, futureTime(3, 10));
    await book(driver, elsewhereSlot.id);
    await patch(admin, `/bookings/${second.id}/cancel`, { reason: 'Test reason' });

    const all = await get(admin, '/bookings');
    expect(all.status).toBe(200);
    expect(all.body.bookings).toHaveLength(3);
    expect(all.body.bookings.find((b) => b.id === first.id)).toMatchObject({
      driver_name: 'Driver One',
      driver_email: 'driver1@test.dev',
      station_name: 'Test Station',
      status: 'confirmed',
    });
    expect(all.body.bookings[0].start_time).toBeTruthy();

    const cancelled = await get(admin, '/bookings?status=cancelled');
    expect(cancelled.body.bookings.map((b) => b.id)).toEqual([second.id]);

    const byStation = await get(admin, `/bookings?stationId=${otherStation.id}`);
    expect(byStation.body.bookings).toHaveLength(1);
    expect(byStation.body.bookings[0].station_name).toBe('Elsewhere');

    const tomorrow = appDateString(futureTime(1, 12));
    const byDate = await get(admin, `/bookings?date=${tomorrow}`);
    expect(byDate.body.bookings.map((b) => b.id).sort()).toEqual([first.id, second.id].sort());
    const empty = await get(admin, `/bookings?date=${appDateString(futureTime(20, 12))}`);
    expect(empty.body.bookings).toHaveLength(0);

    expect((await get(admin, '/bookings?date=2026-02-31')).status).toBe(400);
    expect((await get(admin, '/bookings?status=pending')).status).toBe(400);
  });

  it('pages the bookings, newest first, with the total', async () => {
    const { driver, slots } = await createScenario();
    const admin = await createAdmin();
    const made = [];
    for (const slot of slots) made.push((await book(driver, slot.id)).body.booking);

    const page1 = await get(admin, '/bookings?pageSize=2');
    expect(page1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page1.body.bookings).toHaveLength(2);
    const page2 = await get(admin, '/bookings?pageSize=2&page=2');
    expect(page2.body.bookings.map((b) => b.id)).toEqual([made[0].id]);
    expect((await get(admin, '/bookings?pageSize=abc')).status).toBe(400);
  });

  it('cancels a booking with a reason, frees the slot so it can be booked again, and logs it', async () => {
    const { admin, driver, otherDriver, slots, first } = await bookedScenario();

    const res = await patch(admin, `/bookings/${first.id}/cancel`, { reason: '  Charger damaged in a storm  ' });

    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ id: first.id, status: 'cancelled', driver_name: 'Driver One' });
    expect((await db('slots').where({ id: slots[0].id }).first()).status).toBe('available');

    const [entry] = await auditRows();
    expect(entry).toMatchObject({
      admin_id: admin.id,
      action: 'booking.cancel',
      target: `booking:${first.id}`,
      reason: 'Charger damaged in a storm',
    });

    // The slot is genuinely bookable again, by someone else; the original driver's history keeps the cancellation.
    expect((await book(otherDriver, slots[0].id)).status).toBe(201);
    const mine = await request(app).get('/api/bookings/me').set(as(driver));
    expect(mine.body.bookings[0].status).toBe('cancelled');
  });

  it('requires a reason', async () => {
    const { admin, first, slots } = await bookedScenario();

    expect((await patch(admin, `/bookings/${first.id}/cancel`, { reason: undefined })).status).toBe(400);
    expect((await patch(admin, `/bookings/${first.id}/cancel`, { reason: '   ' })).status).toBe(400);
    expect((await patch(admin, `/bookings/${first.id}/cancel`, { reason: ' four ' })).status).toBe(400); // under 5 once trimmed
    expect((await patch(admin, `/bookings/${first.id}/cancel`, { reason: 'x'.repeat(501) })).status).toBe(400);

    expect((await db('bookings').where({ id: first.id }).first()).status).toBe('confirmed');
    expect((await db('slots').where({ id: slots[0].id }).first()).status).toBe('booked');
    expect(await auditRows()).toHaveLength(0);
  });

  it('is idempotent and logs a cancellation only once', async () => {
    const { admin, first } = await bookedScenario();

    await patch(admin, `/bookings/${first.id}/cancel`, { reason: 'First reason' });
    const again = await patch(admin, `/bookings/${first.id}/cancel`, { reason: 'Second reason' });

    expect(again.status).toBe(200);
    expect(again.body.booking.status).toBe('cancelled');
    expect(await auditRows()).toHaveLength(1);
  });

  it('returns 404 for an unknown booking', async () => {
    const { admin } = await bookedScenario();
    expect((await patch(admin, '/bookings/99999/cancel', { reason: 'No such booking' })).status).toBe(404);
  });
});

describe('overview', () => {
  it('counts users, stations, chargers and bookings', async () => {
    const { operator, driver, otherDriver, slots } = await createScenario();
    const admin = await createAdmin();
    await createUser({ name: 'Sleepy', email: 'sleepy@test.dev', role: 'driver', is_active: false });
    const closed = await createStation(operator.id, { name: 'Closed', is_active: false });
    await createCharger(closed.id, { status: 'offline' });
    await createCharger(closed.id, { status: 'unavailable' });
    await book(driver, slots[0].id);
    const cancelled = await book(otherDriver, slots[1].id);
    await patch(admin, `/bookings/${cancelled.body.booking.id}/cancel`, { reason: 'Test reason' });

    const res = await get(admin, '/overview');

    expect(res.status).toBe(200);
    expect(res.body.overview).toMatchObject({
      users: { total: 6, drivers: 3, operators: 2, admins: 1, suspended: 1 },
      stations: { total: 2, active: 1, inactive: 1 },
      chargers: { total: 3, online: 1, offline: 1, unavailable: 1 },
      bookings: { total: 2, confirmed: 1, cancelled: 1, upcoming: 1 },
    });
  });

  it('reports 7-day slot utilisation over bookable capacity, per day', async () => {
    const { operator, driver, slots, charger } = await createScenario();
    const admin = await createAdmin();
    await book(driver, slots[0].id); // tomorrow 10:00 booked; 11:00 and 12:00 open
    await createSlot(charger.id, futureTime(1, 13), { status: 'blocked' }); // blocked: not capacity
    const closed = await createStation(operator.id, { name: 'Closed', is_active: false });
    const closedCharger = await createCharger(closed.id);
    await createSlot(closedCharger.id, futureTime(1, 10)); // open, but nobody can book it: not capacity
    const offlineCharger = await createCharger((await createStation(operator.id, { name: 'Dark' })).id, { status: 'offline' });
    await createSlot(offlineCharger.id, futureTime(1, 11)); // same
    await createSlot(charger.id, futureTime(9, 10)); // outside the 7-day window

    const { utilisation } = (await get(admin, '/overview')).body.overview;

    expect(utilisation.days).toHaveLength(7);
    const tomorrow = utilisation.days.find((d) => d.date === appDateString(futureTime(1, 12)));
    expect(tomorrow).toMatchObject({ booked: 1, open: 2, rate: 33.3 });
    expect(utilisation).toMatchObject({ booked: 1, open: 2, rate: 33.3 });
    expect(utilisation.days.filter((d) => d.rate === null)).toHaveLength(6); // no capacity, no rate
  });

  it('leaves slots that have already started out of utilisation', async () => {
    const { driver, slots, charger } = await createScenario();
    const admin = await createAdmin();
    await book(driver, slots[0].id);
    const started = new Date(Date.now() - 30 * 60 * 1000);
    await createSlot(charger.id, started, { status: 'booked' });
    await createSlot(charger.id, new Date(started.getTime() - 60 * 60 * 1000));

    const { utilisation } = (await get(admin, '/overview')).body.overview;

    expect(utilisation).toMatchObject({ booked: 1, open: 2 }); // only tomorrow's three slots
    const today = utilisation.days[0];
    expect(today).toMatchObject({ booked: 0, open: 0, rate: null });
  });

  it('has no revenue or price figures', async () => {
    const { driver, slots } = await createScenario();
    const admin = await createAdmin();
    await book(driver, slots[0].id);

    const res = await get(admin, '/overview');

    expect(JSON.stringify(res.body)).not.toMatch(/revenue|earning|price|naira|amount/i);
  });
});

describe('slot coverage', () => {
  it('shows slots per charger per day and flags days with none', async () => {
    const { operator, charger } = await createScenario(); // 3 slots tomorrow
    const admin = await createAdmin();
    const bare = await createCharger((await createStation(operator.id, { name: 'Bare' })).id);

    const res = await get(admin, '/slot-coverage?days=5');

    expect(res.status).toBe(200);
    const { coverage } = res.body;
    expect(coverage.days).toBe(5);
    expect(coverage.dates).toHaveLength(5);
    expect(coverage.dates[1]).toBe(appDateString(futureTime(1, 12)));

    const covered = coverage.chargers.find((c) => c.chargerId === charger.id);
    expect(covered.days[1]).toEqual({ date: coverage.dates[1], slots: 3, gap: false });
    expect(covered.days.slice(2).every((d) => d.slots === 0 && d.gap)).toBe(true);
    expect(covered.gapDays).toBeGreaterThanOrEqual(3);

    const empty = coverage.chargers.find((c) => c.chargerId === bare.id);
    expect(empty.days.every((d) => d.slots === 0)).toBe(true);
    // Today only counts as a gap while a default slot could still be created for it.
    expect(empty.gapDays).toBeGreaterThanOrEqual(4);
    expect(empty).toMatchObject({ stationName: 'Bare', stationActive: true, status: 'online' });

    expect(coverage.summary).toMatchObject({ chargers: 2, chargersWithGaps: 2 });
    expect(coverage.summary.gapDays).toBe(covered.gapDays + empty.gapDays);
  });

  it('leaves slots that have already started out of the counts', async () => {
    const { charger } = await createScenario();
    const admin = await createAdmin();
    await createSlot(charger.id, new Date(Date.now() - 30 * 60 * 1000));

    const { coverage } = (await get(admin, '/slot-coverage?days=2')).body;

    const covered = coverage.chargers.find((c) => c.chargerId === charger.id);
    expect(covered.days[0].slots).toBe(0);
    expect(covered.days[1].slots).toBe(3);
  });

  it('validates days', async () => {
    const admin = await createAdmin();
    expect((await get(admin, '/slot-coverage?days=0')).status).toBe(400);
    expect((await get(admin, '/slot-coverage?days=31')).status).toBe(400);
  });

  it('top-up fills the gaps for every charger and logs it', async () => {
    const { operator } = await createScenario();
    const admin = await createAdmin();
    await createCharger((await createStation(operator.id, { name: 'Bare' })).id);

    const topUp = await post(admin, '/slots/top-up', { days: 3 });

    expect(topUp.status).toBe(200);
    expect(topUp.body).toMatchObject({ chargers: 2, days: 3 });
    expect(topUp.body.created).toBeGreaterThan(24);
    const { coverage } = (await get(admin, '/slot-coverage?days=3')).body;
    expect(coverage.summary).toMatchObject({ chargersWithGaps: 0, gapDays: 0 });

    const [entry] = await auditRows();
    expect(entry).toMatchObject({ admin_id: admin.id, action: 'slots.top_up', target: 'chargers:all' });
    expect(JSON.parse(entry.details)).toMatchObject({ days: 3, created: topUp.body.created });

    expect((await post(admin, '/slots/top-up', { days: 0 })).status).toBe(400);
    expect((await post(admin, '/slots/top-up', { days: 31 })).status).toBe(400);
  });
});
