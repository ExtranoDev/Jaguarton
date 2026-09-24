// Phase 3: station approval, operator tools (edit, block/unblock, archive, cancel with a reason) and
// the confirmation before taking a charger with upcoming bookings offline.
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
  createSlot,
  futureTime,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

const call = (method, url, user, body) => {
  const req = request(app)[method](url);
  if (user) req.set(authHeader(user));
  return body === undefined ? req : req.send(body);
};
const book = (driver, slotId) => call('post', '/api/bookings', driver, { slotId });
const publicNames = async () => (await call('get', '/api/stations')).body.stations.map((s) => s.name);
const auditActions = async () => (await db('audit_log').orderBy('id')).map((row) => row.action);

// ------------------------------------------------------------------------------ approval

describe('station approval', () => {
  it('keeps a new station pending, hidden and unbookable until an admin approves it', async () => {
    const { operator, driver } = await createScenario();
    const admin = await createAdmin();

    const created = await call('post', '/api/stations', operator, { name: 'Fresh Hub', address: '9 New Road', lat: 6.5, lng: 3.4 });
    expect(created.status).toBe(201);
    expect(created.body.station).toMatchObject({ approval_status: 'pending', archived: false });
    const station = created.body.station;
    const charger = (await call('post', `/api/stations/${station.id}/chargers`, operator, { connectorType: 'CCS2_DC', powerKw: 50, pricePerKwh: 200 })).body.charger;
    const slot = await createSlot(charger.id, futureTime(1, 15));

    expect(await publicNames()).toEqual(['Test Station']); // the scenario's station was approved by default
    expect((await call('get', `/api/stations/${station.id}`)).status).toBe(404);
    expect((await call('get', `/api/chargers/${charger.id}/slots`)).body.slots).toEqual([]);
    expect((await book(driver, slot.id)).status).toBe(409);
    const mine = (await call('get', '/api/operator/stations', operator)).body.stations.find((s) => s.id === station.id);
    expect(mine.approval_status).toBe('pending');
    expect((await call('get', `/api/stations/${station.id}`, operator)).status).toBe(200); // the owner can open it

    const queue = await call('get', '/api/admin/stations?approval=pending', admin);
    expect(queue.body.stations.map((s) => s.name)).toEqual(['Fresh Hub']);

    const approved = await call('patch', `/api/admin/stations/${station.id}/approval`, admin, { decision: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body.station.approval_status).toBe('approved');
    expect(await publicNames()).toEqual(['Test Station', 'Fresh Hub']);
    expect((await book(driver, slot.id)).status).toBe(201);
    expect(await auditActions()).toContain('station.approve');
  });

  it('rejects with a reason the operator sees; editing the station resubmits it for approval', async () => {
    const { operator } = await createScenario();
    const admin = await createAdmin();
    const station = (await call('post', '/api/stations', operator, { name: 'Maybe Hub', address: '1 Road', lat: 6.5, lng: 3.4 })).body.station;

    expect((await call('patch', `/api/admin/stations/${station.id}/approval`, admin, { decision: 'reject' })).status).toBe(400);
    expect((await call('patch', `/api/admin/stations/${station.id}/approval`, admin, { decision: 'reject', reason: 'odd' })).status).toBe(400);
    expect((await call('patch', `/api/admin/stations/${station.id}/approval`, admin, { decision: 'maybe', reason: 'Not sure' })).status).toBe(400);
    const rejected = await call('patch', `/api/admin/stations/${station.id}/approval`, admin, { decision: 'reject', reason: 'The pin is in the lagoon' });
    expect(rejected.body.station).toMatchObject({ approval_status: 'rejected', review_note: 'The pin is in the lagoon' });

    const mine = (await call('get', '/api/operator/stations', operator)).body.stations.find((s) => s.id === station.id);
    expect(mine).toMatchObject({ approval_status: 'rejected', review_note: 'The pin is in the lagoon' });

    const edited = await call('put', `/api/stations/${station.id}`, operator, { name: 'Maybe Hub', address: '1 Road, Lekki', lat: 6.44, lng: 3.47 });
    expect(edited.body.station).toMatchObject({ approval_status: 'pending', review_note: null });

    const [rejectEntry] = await db('audit_log').where({ action: 'station.reject' });
    expect(rejectEntry).toMatchObject({ reason: 'The pin is in the lagoon', owner_id: operator.id });
    const [update] = await db('audit_log').where({ action: 'station.update' });
    expect(JSON.parse(update.changes)).toMatchObject({ approval_status: { from: 'rejected', to: 'pending' } });
  });

  it('keeps an approved station approved when its operator edits it', async () => {
    const { operator, station } = await createScenario();
    const res = await call('put', `/api/stations/${station.id}`, operator, { name: 'Better Name', address: station.address, lat: 6.45, lng: 3.42 });
    expect(res.body.station).toMatchObject({ name: 'Better Name', approval_status: 'approved' });
    expect(await publicNames()).toEqual(['Better Name']);
  });

  it('is admin-only, and counts pending stations on the overview', async () => {
    const { operator, station } = await createScenario();
    const admin = await createAdmin();
    await call('post', '/api/stations', operator, { name: 'Queued', address: '2 Road', lat: 6.5, lng: 3.4 });
    expect((await call('patch', `/api/admin/stations/${station.id}/approval`, operator, { decision: 'approve' })).status).toBe(403);
    expect((await call('get', '/api/admin/overview', admin)).body.overview.stations).toMatchObject({ total: 2, pending: 1 });
  });
});

// ------------------------------------------------------------------------------ archiving

describe('archiving', () => {
  it('refuses to archive a station with upcoming bookings; once they are cancelled it hides it, keeping its history', async () => {
    const { operator, driver, station, slots } = await createScenario();
    const booking = (await book(driver, slots[0].id)).body.booking;

    const refused = await call('patch', `/api/stations/${station.id}/archive`, operator, { archived: true });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'HAS_UPCOMING_BOOKINGS', upcomingBookings: 1 });

    await call('patch', `/api/operator/bookings/${booking.id}/cancel`, operator, { reason: 'Closing this site' });
    const archived = await call('patch', `/api/stations/${station.id}/archive`, operator, { archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.station.archived).toBe(true);

    expect(await publicNames()).toEqual([]);
    expect((await book(driver, slots[1].id)).status).toBe(409);
    expect((await db('bookings').where({ id: booking.id }).first()).status).toBe('cancelled'); // history kept
    expect((await call('get', '/api/operator/stations', operator)).body.stations[0]).toMatchObject({ id: station.id, archived: true });
    expect((await call('put', `/api/stations/${station.id}`, operator, { name: 'X', address: 'Y', lat: 6, lng: 3 })).status).toBe(409);
    expect((await call('post', '/api/operator/slots/top-up', operator, { days: 2 })).body.chargers).toBe(0);

    const restored = await call('patch', `/api/stations/${station.id}/archive`, operator, { archived: false });
    expect(restored.body.station.archived).toBe(false);
    expect(await publicNames()).toEqual(['Test Station']);
    expect(await auditActions()).toEqual(expect.arrayContaining(['station.archive', 'station.unarchive']));
  });

  it('archives and restores a charger: gone for drivers, unbookable, still listed for its operator', async () => {
    const { operator, driver, station, charger, slots } = await createScenario();
    const other = await createCharger(station.id, { connector_type: 'Type2_AC' });

    expect((await call('patch', `/api/chargers/${charger.id}/archive`, operator, { archived: true })).status).toBe(200);

    const detail = (await call('get', `/api/stations/${station.id}`)).body.station;
    expect(detail.chargers.map((c) => c.id)).toEqual([other.id]);
    expect((await call('get', `/api/chargers/${charger.id}/slots`)).body.slots).toEqual([]);
    expect((await book(driver, slots[0].id)).status).toBe(409);
    const mine = (await call('get', '/api/operator/stations', operator)).body.stations[0].chargers;
    expect(mine.find((c) => c.id === charger.id).archived).toBe(true);
    expect((await call('patch', `/api/chargers/${charger.id}/status`, operator, { status: 'offline' })).status).toBe(409);
    expect((await call('post', `/api/chargers/${charger.id}/slots`, operator, { date: '2030-01-01' })).status).toBe(409);

    expect((await call('patch', `/api/chargers/${charger.id}/archive`, operator, { archived: false })).status).toBe(200);
    expect((await book(driver, slots[0].id)).status).toBe(201);
    expect((await call('patch', `/api/chargers/${charger.id}/archive`, operator, { archived: true })).body).toMatchObject({ upcomingBookings: 1 });
  });

  it("only lets the owner archive, and archived stations drop out of the admin's coverage", async () => {
    const { operator, otherOperator, station } = await createScenario();
    const admin = await createAdmin();
    expect((await call('patch', `/api/stations/${station.id}/archive`, otherOperator, { archived: true })).status).toBe(403);
    expect((await call('patch', `/api/stations/${station.id}/archive`, operator, { archived: 'yes' })).status).toBe(400);

    expect((await call('get', '/api/admin/slot-coverage', admin)).body.coverage.summary.chargers).toBe(1);
    await call('patch', `/api/stations/${station.id}/archive`, operator, { archived: true });
    expect((await call('get', '/api/admin/slot-coverage', admin)).body.coverage.summary.chargers).toBe(0);
    expect((await call('get', '/api/admin/stations?approval=archived', admin)).body.stations.map((s) => s.id)).toEqual([station.id]);
  });
});

// ------------------------------------------------------------------------------ slots

describe('blocking and unblocking slots', () => {
  it("lets the owner see and block slots even while the charger is offline; drivers see none", async () => {
    const { operator, driver, charger, slots } = await createScenario();
    await db('chargers').where({ id: charger.id }).update({ status: 'offline' });

    expect((await call('get', `/api/chargers/${charger.id}/slots`, driver)).body.slots).toEqual([]);
    const own = await call('get', `/api/chargers/${charger.id}/slots`, operator);
    expect(own.body.slots.map((s) => s.id)).toEqual(slots.map((s) => s.id));

    expect((await call('patch', `/api/slots/${slots[0].id}`, operator, { status: 'blocked' })).body.slot.status).toBe('blocked');
    expect((await call('patch', `/api/slots/${slots[0].id}`, operator, { status: 'available' })).body.slot.status).toBe('available');
  });
});

// ------------------------------------------------------------------------------ cancelling

describe('operators cancelling bookings', () => {
  it('cancels a booking at their station with a reason, freeing the slot and telling the driver', async () => {
    const { operator, driver, slots } = await createScenario();
    const booking = (await book(driver, slots[0].id)).body.booking;
    const cancel = (reason) => call('patch', `/api/operator/bookings/${booking.id}/cancel`, operator, { reason });

    expect((await cancel(undefined)).status).toBe(400);
    expect((await cancel('abc')).status).toBe(400);
    const res = await cancel('  Power cut on site  ');
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');
    expect((await db('slots').where({ id: slots[0].id }).first()).status).toBe('available');
    expect((await call('get', '/api/bookings/me', driver)).body.bookings[0].status).toBe('cancelled');

    const [entry] = await db('audit_log').where({ action: 'booking.cancel' });
    expect(entry).toMatchObject({ actor_role: 'operator', actor_id: operator.id, reason: 'Power cut on site', owner_id: operator.id });
    expect((await cancel('Again, twice')).status).toBe(200); // already cancelled: nothing more happens
    expect(await db('audit_log').where({ action: 'booking.cancel' })).toHaveLength(1);
  });

  it("can't cancel another operator's booking (404) or one that has started (409)", async () => {
    const { operator, otherOperator, driver, charger, slots } = await createScenario();
    const booking = (await book(driver, slots[0].id)).body.booking;
    expect((await call('patch', `/api/operator/bookings/${booking.id}/cancel`, otherOperator, { reason: 'Not mine' })).status).toBe(404);
    expect((await call('patch', `/api/operator/bookings/${booking.id}/cancel`, driver, { reason: 'Not mine' })).status).toBe(403);

    // A booking whose slot has started (moved into the past after it was made).
    const started = await createSlot(charger.id, new Date(Date.now() - 20 * 60 * 1000), { status: 'booked' });
    const [live] = await db('bookings')
      .insert({ slot_id: started.id, user_id: driver.id, charger_id: charger.id, station_id: booking.station_id, booking_reference: 'EVB-LIVE01', price_at_booking: 200 })
      .returning('*');
    const res = await call('patch', `/api/operator/bookings/${live.id}/cancel`, operator, { reason: 'Too late now' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already started/);
  });
});

// ------------------------------------------------------------------------------ offline confirmation

describe('taking a charger offline with upcoming bookings', () => {
  it('needs confirm: true, says how many bookings, and logs the count', async () => {
    const { operator, driver, charger, slots } = await createScenario();
    await book(driver, slots[0].id);
    await book(driver, slots[1].id);

    const asked = await call('patch', `/api/chargers/${charger.id}/status`, operator, { status: 'offline' });
    expect(asked.status).toBe(409);
    expect(asked.body).toMatchObject({ code: 'CONFIRM_REQUIRED', upcomingBookings: 2 });
    expect(asked.body.error).toMatch(/2 upcoming bookings/);
    expect((await db('chargers').where({ id: charger.id }).first()).status).toBe('online');

    const confirmed = await call('patch', `/api/chargers/${charger.id}/status`, operator, { status: 'offline', confirm: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.charger.status).toBe('offline');
    const [entry] = await db('audit_log').where({ action: 'charger.status' });
    expect(JSON.parse(entry.details)).toEqual({ upcomingBookings: 2 });
    expect((await db('bookings').where({ status: 'confirmed' })).length).toBe(2); // nobody's booking was cancelled

    // Back online never needs confirming.
    expect((await call('patch', `/api/chargers/${charger.id}/status`, operator, { status: 'online' })).status).toBe(200);
  });

  it('applies to the edit form and to admins too, and not to chargers without upcoming bookings', async () => {
    const { operator, driver, station, charger, slots } = await createScenario();
    const admin = await createAdmin();
    const idle = await createCharger(station.id);
    await book(driver, slots[0].id);

    const edit = { connectorType: 'CCS2_DC', powerKw: 50, pricePerKwh: 200, status: 'unavailable' };
    expect((await call('put', `/api/chargers/${charger.id}`, operator, edit)).body.code).toBe('CONFIRM_REQUIRED');
    expect((await call('put', `/api/chargers/${charger.id}`, operator, { ...edit, confirm: true })).status).toBe(200);

    await db('chargers').where({ id: charger.id }).update({ status: 'online' });
    expect((await call('patch', `/api/admin/chargers/${charger.id}/status`, admin, { status: 'offline' })).body).toMatchObject({ upcomingBookings: 1 });
    expect((await call('patch', `/api/admin/chargers/${charger.id}/status`, admin, { status: 'offline', confirm: true })).status).toBe(200);

    expect((await call('patch', `/api/chargers/${idle.id}/status`, operator, { status: 'offline' })).status).toBe(200);
    expect((await call('patch', `/api/chargers/${idle.id}/status`, operator, { status: 'online', confirm: 'yes' })).status).toBe(400);
  });
});

// ------------------------------------------------------------------------------ utilisation

describe('what counts as bookable capacity', () => {
  it('leaves pending and archived stations and archived chargers out of utilisation', async () => {
    const { operator, station, charger } = await createScenario();
    const admin = await createAdmin();
    const open = async () => (await call('get', '/api/admin/overview', admin)).body.overview.utilisation.open;
    expect(await open()).toBe(3);

    await db('chargers').where({ id: charger.id }).update({ archived_at: new Date().toISOString() });
    expect(await open()).toBe(0);
    await db('chargers').where({ id: charger.id }).update({ archived_at: null });
    await db('stations').where({ id: station.id }).update({ approval_status: 'pending' });
    expect(await open()).toBe(0);

    const second = await createStation(operator.id, { name: 'Second' });
    await createSlot((await createCharger(second.id)).id, futureTime(1, 9));
    expect(await open()).toBe(1);
  });
});
