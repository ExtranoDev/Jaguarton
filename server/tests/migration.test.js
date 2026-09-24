// Rolls the admin migrations (and every later one) back and forward again on whichever database the
// suite runs against (SQLite, or Postgres via TEST_DATABASE_URL), with data in every
// table, to prove neither direction loses rows or leaves the schema half-changed.
const fs = require('fs');
const path = require('path');
const { generateBookingReference } = require('../src/utils/bookingReference');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  createAdmin,
  createScenario,
} = require('./helpers');

// The first admin migration is 20260101000007; everything from there on is rolled back.
const MIGRATIONS_TO_ROLL_BACK = fs
  .readdirSync(path.join(__dirname, '../src/db/migrations'))
  .filter((file) => file.endsWith('.js') && file >= '20260101000007').length;

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
    for (let i = 0; i < MIGRATIONS_TO_ROLL_BACK; i += 1) await db.migrate.down();

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

describe('migration 10: case-insensitive emails and token_version', () => {
  const MIGRATION = '20260101000010_case_insensitive_emails_and_token_version.js';
  const emails = async () => (await db('users').orderBy('id').select('email')).map((row) => row.email);

  it('lower-cases existing emails and adds token_version (0 for everyone)', async () => {
    try {
      await db.migrate.down({ name: MIGRATION });
      expect(await db.schema.hasColumn('users', 'token_version')).toBe(false);
      await insertUser('driver', 'Mixed.Case@Test.DEV');
      await insertUser('operator', 'plain@test.dev');

      await db.migrate.latest();

      expect(await emails()).toEqual(['mixed.case@test.dev', 'plain@test.dev']);
      expect((await db('users').select('token_version')).map((row) => Number(row.token_version))).toEqual([0, 0]);
      await db.migrate.latest(); // re-running is a no-op
      expect(await emails()).toEqual(['mixed.case@test.dev', 'plain@test.dev']);
    } finally {
      await db.migrate.latest();
    }
  });

  it('stops, names the clash and changes nothing when two accounts differ only by case', async () => {
    try {
      await db.migrate.down({ name: MIGRATION });
      await insertUser('driver', 'Ada@Test.dev');
      await insertUser('driver', 'ada@test.dev');

      await expect(db.migrate.latest()).rejects.toThrow(/ada@test\.dev \(2 accounts\)/);

      expect(await emails()).toEqual(['Ada@Test.dev', 'ada@test.dev']);
      expect(await db.schema.hasColumn('users', 'token_version')).toBe(false);
    } finally {
      await db('users').where({ email: 'Ada@Test.dev' }).del();
      await db.migrate.latest();
    }
  });
});
