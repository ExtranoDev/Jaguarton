// Rolls the three admin migrations back and forward again on whichever database the
// suite runs against (SQLite, or Postgres via TEST_DATABASE_URL), with data in every
// table, to prove neither direction loses rows or leaves the schema half-changed.
const { generateBookingReference } = require('../src/utils/bookingReference');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  createAdmin,
  createScenario,
} = require('./helpers');

const ADMIN_MIGRATIONS = 3;

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(async () => {
  await db.migrate.latest();
  await teardownDatabase();
});

async function counts() {
  const result = {};
  for (const table of ['users', 'stations', 'chargers', 'slots', 'bookings']) {
    result[table] = Number((await db(table).count('* as n').first()).n);
  }
  return result;
}

const rejects = async (promise) => {
  try {
    await promise;
    return false;
  } catch {
    return true;
  }
};

const insertUser = (role, email) => db('users').insert({ name: 'Role Check', email, role, password_hash: 'x' });

it('rolls back and re-applies cleanly, keeping every non-admin row', async () => {
  const { driver, station, charger, slots } = await createScenario();
  await db('bookings').insert({
    slot_id: slots[0].id,
    user_id: driver.id,
    charger_id: charger.id,
    station_id: station.id,
    booking_reference: generateBookingReference(),
    price_at_booking: 200,
  });
  await db('slots').where({ id: slots[0].id }).update({ status: 'booked' });
  const admin = await createAdmin();
  await db('admin_actions').insert({ admin_id: admin.id, action: 'user.suspend', target: `user:${driver.id}` });
  const before = await counts();

  try {
    for (let i = 0; i < ADMIN_MIGRATIONS; i += 1) await db.migrate.down();

    // Old schema: no admin role, no is_active, no audit table; the admin user is gone,
    // everything else (including the booking that references users) is intact.
    expect(await db.schema.hasTable('admin_actions')).toBe(false);
    expect(await db.schema.hasColumn('users', 'is_active')).toBe(false);
    expect(await db.schema.hasColumn('stations', 'is_active')).toBe(false);
    expect(await counts()).toEqual({ ...before, users: before.users - 1 });
    expect(await db('users').where({ role: 'admin' })).toHaveLength(0);
    expect(await rejects(insertUser('admin', 'nope@test.dev'))).toBe(true);
    expect(await rejects(insertUser('driver', 'driver1@test.dev'))).toBe(true); // email is still unique
    expect(await insertUser('driver', 'fresh@test.dev')).toBeDefined();
    await db('users').where({ email: 'fresh@test.dev' }).del();
  } finally {
    await db.migrate.latest();
  }

  // New schema again: admin allowed, unknown roles still rejected, existing rows active.
  expect(await counts()).toEqual({ ...before, users: before.users - 1 });
  expect(await db.schema.hasTable('admin_actions')).toBe(true);
  expect(await rejects(insertUser('root', 'root@test.dev'))).toBe(true);
  await insertUser('admin', 'again@test.dev');
  const users = await db('users').select('is_active');
  expect(users.every((user) => Boolean(user.is_active))).toBe(true);
  expect(await db('stations').first()).toHaveProperty('is_active');
});
