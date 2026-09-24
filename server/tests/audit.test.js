// Phase 2: the audit log. What gets recorded (security, operator, booking and admin events), the
// snapshots and before/after values, reasons, the admin and operator views, and retention.
const request = require('supertest');
const app = require('../src/app');
const audit = require('../src/modules/audit/audit.service');
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

const DAY = 24 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (audit test)';
const call = (method, url, user, body) => {
  let req = request(app)[method](url).set('User-Agent', UA).set('X-Forwarded-For', '203.0.113.50');
  if (user) req = req.set(authHeader(user));
  return body === undefined ? req : req.send(body);
};
const entries = (where = {}) => db('audit_log').where(where).orderBy('id');
const json = (text) => (text == null ? null : JSON.parse(text));
const signup = (email = 'ada@test.dev', password = 'first-password') =>
  call('post', '/api/auth/signup', null, { name: 'Ada Obi', email, password, role: 'driver' });

// ------------------------------------------------------------------------------ security

describe('security events', () => {
  it('records sign-up, login, failed logins (expiring in 90 days), a lockout and a suspended login, with IP and browser', async () => {
    const { body } = await signup();
    await call('post', '/api/auth/login', null, { email: 'ada@test.dev', password: 'first-password' });
    await call('post', '/api/auth/login', null, { email: 'ghost@test.dev', password: 'whatever' });
    for (let i = 0; i < 10; i += 1) await call('post', '/api/auth/login', null, { email: 'ada@test.dev', password: 'wrong-password' });
    await db('users').where({ id: body.user.id }).update({ is_active: false });
    await call('post', '/api/auth/login', null, { email: 'ada@test.dev', password: 'first-password' }).set('X-Forwarded-For', '198.51.100.9');

    const rows = await entries();
    expect(rows.map((row) => row.action)).toEqual([
      'auth.signup',
      'auth.login',
      'auth.login_failed',
      ...Array(10).fill('auth.login_failed'),
      'auth.lockout',
      'auth.login_suspended',
    ]);
    for (const row of rows) expect(row.category).toBe('security');
    expect(rows[0]).toMatchObject({ actor_id: body.user.id, actor_name: 'Ada Obi', actor_email: 'ada@test.dev', ip: '203.0.113.50', user_agent: UA });

    const unknown = rows[2];
    expect(unknown).toMatchObject({ actor_id: null, actor_email: 'ghost@test.dev' });
    expect(json(unknown.details)).toEqual({ knownAccount: false, failuresInWindow: 1 });
    const expiresIn = new Date(unknown.expires_at).getTime() - new Date(unknown.created_at).getTime();
    expect(Math.round(expiresIn / DAY)).toBe(90);

    expect(json(rows[13].details)).toEqual({ failures: 10, minutes: 15 });
    for (const row of rows.filter((r) => r.action !== 'auth.login_failed')) expect(row.expires_at).toBeNull();
    expect(rows[14].ip).toBe('198.51.100.9'); // the lockout is per email+IP, so another IP still gets through to the check
  });

  it('records password and profile changes with before -> after (never the password)', async () => {
    const { body } = await signup();
    const user = { id: body.user.id, role: 'driver' };
    await call('patch', '/api/auth/me', user, { name: 'Ada N. Obi' });
    await call('post', '/api/auth/change-password', user, { currentPassword: 'first-password', newPassword: 'second-password' });

    const [profile, password] = await entries({ category: 'security' }).whereIn('action', ['auth.profile_update', 'auth.password_change']);
    expect(json(profile.changes)).toEqual({ name: { from: 'Ada Obi', to: 'Ada N. Obi' } });
    expect(password).toMatchObject({ action: 'auth.password_change', target_id: body.user.id, changes: null });
    expect(JSON.stringify(await entries())).not.toMatch(/first-password|second-password/);
  });
});

// ------------------------------------------------------------------------------ operators

describe('operator changes', () => {
  it('records station, charger and slot changes with before -> after, scoped to the station and its owner', async () => {
    const { operator, station, charger, slots } = await createScenario();
    const op = (method, url, body) => call(method, url, operator, body);

    const created = (await op('post', '/api/stations', { name: 'New Hub', address: '2 Road', lat: 6.5, lng: 3.4 })).body.station;
    await op('put', `/api/stations/${station.id}`, { name: 'Renamed Station', address: station.address, lat: 6.45, lng: 3.42 });
    await op('post', `/api/stations/${station.id}/chargers`, { connectorType: 'Type2_AC', powerKw: 22, pricePerKwh: 150 });
    await op('put', `/api/chargers/${charger.id}`, { connectorType: 'CCS2_DC', powerKw: 60, pricePerKwh: 200 });
    await op('patch', `/api/chargers/${charger.id}/status`, { status: 'offline' });
    await op('patch', `/api/chargers/${charger.id}/status`, { status: 'offline' }); // no change, no entry
    await op('post', `/api/chargers/${charger.id}/slots`, { date: appDateString(futureTime(3, 0)), startHour: 8, endHour: 10 });
    await op('post', '/api/operator/slots/top-up', { days: 1, stationId: station.id });
    await op('patch', `/api/slots/${slots[0].id}`, { status: 'blocked' });
    await op('patch', `/api/slots/${slots[0].id}`, { status: 'available' });
    await op('delete', `/api/slots/${slots[1].id}`);

    const rows = await entries({ category: 'operator' });
    expect(rows.map((row) => row.action)).toEqual([
      'station.create',
      'station.update',
      'charger.create',
      'charger.update',
      'charger.status',
      'slots.generate',
      'slots.top_up',
      'slot.block',
      'slot.unblock',
      'slot.delete',
    ]);
    for (const row of rows) expect(row).toMatchObject({ actor_id: operator.id, actor_role: 'operator', owner_id: operator.id });
    expect(rows[0]).toMatchObject({ station_id: created.id, target_name: 'New Hub' });
    expect(rows.slice(1).every((row) => row.station_id === station.id)).toBe(true);
    expect(json(rows[1].changes)).toEqual({ name: { from: 'Test Station', to: 'Renamed Station' } });
    expect(json(rows[3].changes)).toEqual({ power_kw: { from: 50, to: 60 } });
    expect(json(rows[4].changes)).toEqual({ status: { from: 'online', to: 'offline' } });
    expect(json(rows[5].details)).toMatchObject({ created: 2 });
    expect(json(rows[7].changes)).toEqual({ status: { from: 'available', to: 'blocked' } });
    expect(rows[9].target_id).toBe(slots[1].id);
  });

  it('writes nothing when the change itself is refused', async () => {
    const { operator, otherOperator, station } = await createScenario();
    await call('put', `/api/stations/${station.id}`, otherOperator, { name: 'Hijack', address: 'x', lat: 6, lng: 3 });
    await call('put', `/api/stations/${station.id}`, operator, { name: '', address: 'x', lat: 6, lng: 3 });
    expect(await entries({ category: 'operator' })).toHaveLength(0);
  });
});

// ------------------------------------------------------------------------------ bookings

describe('booking lifecycle', () => {
  it('records bookings made and cancelled by drivers and by admins, visible to the station owner', async () => {
    const { driver, operator, slots } = await createScenario();
    const admin = await createAdmin();
    const first = (await call('post', '/api/bookings', driver, { slotId: slots[0].id })).body.booking;
    const second = (await call('post', '/api/bookings', driver, { slotId: slots[1].id })).body.booking;
    await call('patch', `/api/bookings/${first.id}/cancel`, driver);
    await call('patch', `/api/admin/bookings/${second.id}/cancel`, admin, { reason: 'Charger damaged' });

    const rows = await entries({ category: 'booking' });
    expect(rows.map((row) => [row.action, row.actor_role])).toEqual([
      ['booking.create', 'driver'],
      ['booking.create', 'driver'],
      ['booking.cancel', 'driver'],
      ['booking.cancel', 'admin'],
    ]);
    for (const row of rows) expect(row).toMatchObject({ owner_id: operator.id, target_type: 'booking', target_email: 'driver1@test.dev' });
    expect(rows[0].target_name).toBe(first.booking_reference);
    expect(json(rows[0].details)).toMatchObject({ slotId: slots[0].id, price: 200 });
    expect(rows[2].reason).toBeNull();
    expect(rows[3].reason).toBe('Charger damaged');
  });
});

// ------------------------------------------------------------------------------ reasons

describe('reasons (at least 5 characters)', () => {
  const REASON = 'Confirmed with the owner';

  it('are required to suspend, deactivate, cancel, change a role and reset a password, and nothing changes without one', async () => {
    const { driver, station, slots } = await createScenario();
    const admin = await createAdmin();
    const other = await createUser({ name: 'Opal', email: 'opal@test.dev', role: 'driver' });
    const booking = (await call('post', '/api/bookings', driver, { slotId: slots[0].id })).body.booking;
    const attempts = (reason) => [
      call('patch', `/api/admin/users/${driver.id}`, admin, { isActive: false, reason }),
      call('patch', `/api/admin/stations/${station.id}`, admin, { isActive: false, reason }),
      call('patch', `/api/admin/bookings/${booking.id}/cancel`, admin, { reason }),
      call('put', `/api/admin/users/${other.id}`, admin, { name: 'Opal', email: 'opal@test.dev', role: 'operator', reason }),
      call('post', `/api/admin/users/${other.id}/reset-password`, admin, { reason }),
    ];

    for (const reason of [undefined, '', '    ', 'abcd', ' ab  ']) {
      for (const res of await Promise.all(attempts(reason))) {
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/reason of at least 5 characters/);
      }
    }
    expect((await db('users').where({ id: driver.id }).first()).is_active).toBeTruthy();
    expect((await db('stations').where({ id: station.id }).first()).is_active).toBeTruthy();
    expect((await db('bookings').where({ id: booking.id }).first()).status).toBe('confirmed');
    expect((await db('users').where({ id: other.id }).first()).role).toBe('driver');
    expect(await entries({ actor_role: 'admin' })).toHaveLength(0);

    for (const res of await Promise.all(attempts(`  ${REASON}  `))) expect(res.status).toBe(200);
    const reasons = (await entries({ actor_role: 'admin' })).map((row) => row.reason);
    expect(reasons).toHaveLength(5);
    expect(new Set(reasons)).toEqual(new Set([REASON]));
  });

  it('are optional to reactivate, and for edits that do not change the role', async () => {
    const { driver, station } = await createScenario();
    const admin = await createAdmin();
    await db('users').where({ id: driver.id }).update({ is_active: false });
    await db('stations').where({ id: station.id }).update({ is_active: false });

    expect((await call('patch', `/api/admin/users/${driver.id}`, admin, { isActive: true })).status).toBe(200);
    expect((await call('patch', `/api/admin/stations/${station.id}`, admin, { isActive: true })).status).toBe(200);
    expect((await call('put', `/api/admin/users/${driver.id}`, admin, { name: 'D. One', email: driver.email, role: 'driver' })).status).toBe(200);
    expect((await entries({ actor_role: 'admin' })).map((row) => row.action)).toEqual(['user.reactivate', 'station.activate', 'user.update']);
  });
});

// ------------------------------------------------------------------------------ keeping it

describe('entries are detached snapshots, kept for good', () => {
  it('keep the names and emails from when they were written, and never block deleting a user', async () => {
    const { driver } = await createScenario();
    const admin = await createAdmin();
    await call('patch', `/api/admin/users/${driver.id}`, admin, { isActive: false, reason: 'Chargeback fraud' });

    await db('users').where({ id: driver.id }).update({ name: 'Someone Else', email: 'else@test.dev' });
    const [entry] = await entries({ action: 'user.suspend' });
    expect(entry).toMatchObject({ target_name: 'Driver One', target_email: 'driver1@test.dev', actor_name: 'Admin One' });

    await db('users').where({ id: admin.id }).del(); // admin_actions' foreign key used to refuse this
    const listed = await audit.listForAdmin({});
    expect(listed.entries[0]).toMatchObject({ actor: { id: admin.id, name: 'Admin One', email: 'admin1@test.dev' } });
  });

  it('survive the full demo seed, which deletes everything else', async () => {
    const { driver } = await createScenario();
    const admin = await createAdmin();
    await call('patch', `/api/admin/users/${driver.id}`, admin, { isActive: false, reason: 'Chargeback fraud' });
    const before = await entries();
    expect(before.length).toBeGreaterThan(0);

    await db.seed.run({ specific: '01_users.js' });

    expect(await db('users').where({ id: driver.id })).toHaveLength(0);
    expect(await entries()).toEqual(before);
  });

  it('only failed logins expire: the purge removes those past 90 days and nothing else', async () => {
    const old = new Date(Date.now() - 91 * DAY).toISOString();
    await db('audit_log').insert([
      { action: 'auth.login_failed', category: 'security', created_at: old, expires_at: new Date(Date.now() - DAY).toISOString() },
      { action: 'auth.login_failed', category: 'security', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + DAY).toISOString() },
      { action: 'user.suspend', category: 'admin', created_at: old, expires_at: null },
      { action: 'auth.login', category: 'security', created_at: old, expires_at: null },
    ]);

    expect(await audit.purgeExpired()).toBe(1);
    expect((await entries()).map((row) => row.action)).toEqual(['auth.login_failed', 'user.suspend', 'auth.login']);
  });
});

// ------------------------------------------------------------------------------ admin view

describe('admin audit log', () => {
  const list = (admin, query = '') => call('get', `/api/admin/audit-log${query}`, admin);

  async function history() {
    const { driver, station, charger, slots } = await createScenario();
    const admin = await createAdmin();
    const booking = (await call('post', '/api/bookings', driver, { slotId: slots[0].id })).body.booking;
    await call('patch', `/api/admin/users/${driver.id}`, admin, { isActive: false, reason: 'Chargeback fraud' });
    await call('patch', `/api/admin/stations/${station.id}`, admin, { isActive: false, reason: 'Flooded site' });
    await call('patch', `/api/admin/chargers/${charger.id}/status`, admin, { status: 'unavailable' });
    await call('patch', `/api/admin/bookings/${booking.id}/cancel`, admin, { reason: 'Site closed for repairs' });
    await call('post', '/api/admin/slots/top-up', admin, { days: 1 });
    return { admin, driver, station, charger, booking };
  }

  it('lists every kind of event newest first, with snapshots, changes, and a full timestamp', async () => {
    const { admin, driver, charger, booking } = await history();
    const res = await list(admin);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 6, page: 1, pageSize: 50 });
    expect(res.body.entries.map((entry) => entry.action)).toEqual([
      'slots.top_up',
      'booking.cancel',
      'charger.status',
      'station.deactivate',
      'user.suspend',
      'booking.create',
    ]);
    const [topUp, cancel, status, , suspend, created] = res.body.entries;
    expect(topUp).toMatchObject({ category: 'admin', actor: { name: 'Admin One', email: 'admin1@test.dev', role: 'admin' }, target: { name: 'All chargers' } });
    expect(cancel).toMatchObject({ category: 'booking', reason: 'Site closed for repairs', target: { name: booking.booking_reference, email: 'driver1@test.dev' } });
    expect(status).toMatchObject({ target: { name: `Charger #${charger.id} · Test Station` }, changes: { status: { from: 'online', to: 'unavailable' } } });
    expect(suspend).toMatchObject({ target: { id: driver.id, name: 'Driver One', email: 'driver1@test.dev' }, ip: '203.0.113.50', user_agent: UA });
    expect(created.actor).toMatchObject({ role: 'driver', name: 'Driver One' });
    expect(new Date(topUp.created_at).toISOString()).toBe(topUp.created_at);
    expect(res.body.actions).toEqual(expect.arrayContaining(['booking.cancel', 'user.suspend', 'slots.top_up']));
  });

  it('filters by actor, action, category, target and date range', async () => {
    const { admin, driver, booking } = await history();
    const actions = async (query) => (await list(admin, query)).body.entries.map((entry) => entry.action);

    expect(await actions('?actor=driver%20one')).toEqual(['booking.create']);
    expect(await actions('?actor=ADMIN1@')).toHaveLength(5);
    expect(await actions('?action=user.suspend')).toEqual(['user.suspend']);
    expect(await actions('?category=booking')).toEqual(['booking.cancel', 'booking.create']);
    expect(await actions(`?target=user:${driver.id}`)).toEqual(['user.suspend']);
    expect(await actions(`?target=${booking.booking_reference.toLowerCase()}`)).toEqual(['booking.cancel', 'booking.create']);
    expect(await actions('?target=test%20station')).toEqual(['charger.status', 'station.deactivate']);

    const today = appDateString(new Date());
    expect(await actions(`?from=${today}&to=${today}`)).toHaveLength(6);
    expect(await actions(`?to=${appDateString(futureTime(-1, 12))}`)).toEqual([]);
    expect(await actions(`?from=${appDateString(futureTime(1, 12))}`)).toEqual([]);
  });

  it('pages through any number of entries (no cap), and validates its query', async () => {
    const admin = await createAdmin();
    const rows = Array.from({ length: 120 }, (_, i) => ({
      action: 'user.suspend',
      category: 'admin',
      actor_role: 'admin',
      created_at: new Date(Date.UTC(2025, 0, 1) + i * 60000).toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 40) await db('audit_log').insert(rows.slice(i, i + 40));

    const third = (await list(admin, '?page=3&pageSize=50')).body;
    expect(third).toMatchObject({ total: 120, page: 3, pageSize: 50 });
    expect(third.entries).toHaveLength(20);
    expect(third.entries[19].created_at).toBe('2025-01-01T00:00:00.000Z'); // the oldest is last

    for (const query of ['?pageSize=101', '?page=0', '?from=2026-02-30', '?from=2026-09-10&to=2026-09-01', '?category=nope', '?action=DROP%20TABLE', '?actor=a&actor=b']) {
      const res = await list(admin, query);
      expect([query, res.status]).toEqual([query, 400]);
    }
  });
});

// ------------------------------------------------------------------------------ operator view

describe('operator history', () => {
  const history = (operator, query = '') => call('get', `/api/operator/history${query}`, operator);

  it("shows only events at the operator's own stations, with other people's emails masked and admins unnamed", async () => {
    const { driver, operator, otherOperator, station, slots } = await createScenario();
    const admin = await createAdmin();
    const theirs = await createStation(otherOperator.id, { name: 'Elsewhere' });
    const theirSlot = await createSlot((await createCharger(theirs.id)).id, futureTime(2, 9));

    await call('post', '/api/bookings', driver, { slotId: slots[0].id });
    await call('post', '/api/bookings', driver, { slotId: theirSlot.id });
    await call('patch', `/api/slots/${slots[1].id}`, operator, { status: 'blocked' });
    await call('patch', `/api/admin/stations/${station.id}`, admin, { isActive: false, reason: 'Safety inspection' });
    await call('patch', `/api/admin/users/${driver.id}`, admin, { isActive: false, reason: 'Chargeback fraud' }); // not at a station

    const res = await history(operator);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    const [deactivate, block, booked] = res.body.entries;
    expect(deactivate).toMatchObject({ action: 'station.deactivate', reason: 'Safety inspection', actor: { role: 'admin', name: 'EChargeFind admin', email: null } });
    expect(block).toMatchObject({ action: 'slot.block', actor: { id: operator.id, email: 'op1@test.dev' } });
    expect(booked).toMatchObject({ action: 'booking.create', actor: { name: 'Driver One', email: 'd***@test.dev' }, target: { email: 'd***@test.dev' } });
    for (const entry of res.body.entries) {
      expect(entry).not.toHaveProperty('ip');
      expect(entry).not.toHaveProperty('user_agent');
    }
    expect(JSON.stringify(res.body)).not.toContain('driver1@test.dev');
    expect(JSON.stringify(res.body)).not.toContain('admin1@test.dev');

    const other = await history(otherOperator);
    expect(other.body.entries.map((entry) => entry.action)).toEqual(['booking.create']);
    expect((await history(operator, `?stationId=${theirs.id}`)).body.total).toBe(0);
  });

  it('is for operators only', async () => {
    const { driver } = await createScenario();
    const admin = await createAdmin();
    expect((await history(null)).status).toBe(401);
    expect((await history(driver)).status).toBe(403);
    expect((await history(admin)).status).toBe(403);
  });

  it('masks emails as first letter and domain', () => {
    expect(audit.maskEmail('chidi@example.com')).toBe('c***@example.com');
    expect(audit.maskEmail('x@y.dev')).toBe('x***@y.dev');
    expect(audit.maskEmail(null)).toBeNull();
  });
});
