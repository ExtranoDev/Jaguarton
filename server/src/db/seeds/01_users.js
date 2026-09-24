const bcrypt = require('bcryptjs');

exports.seed = async function seed(knex) {
  // `npm run seed` starts by deleting every user, station and booking. In production that is almost
  // certainly a mistake, so it needs an explicit yes. This file runs first, so nothing has been
  // touched when it refuses.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_SEED !== 'yes') {
    throw new Error(
      'Refusing to run the full seed with NODE_ENV=production: it deletes every user, station and booking. ' +
        'Use `npm run seed:admin` or `npm run seed:regions` to add data safely, or set ALLOW_DESTRUCTIVE_SEED=yes ' +
        'if you really mean to wipe this database.'
    );
  }

  // Delete in FK-safe order (children before parents) so re-running the
  // seed is idempotent regardless of DB engine. The audit log is never deleted: it has no
  // foreign keys (see migration 11) and is kept forever.
  await knex('bookings').del();
  await knex('slots').del();
  await knex('chargers').del();
  await knex('stations').del();
  await knex('users').del();

  // Demo accounts. Set SEED_PASSWORD when seeding a public deployment.
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD || 'password123', 10);

  await knex('users').insert([
    {
      name: 'Adaeze Okafor',
      email: 'operator@example.com',
      password_hash: passwordHash,
      role: 'operator',
    },
    {
      name: 'Chidi Nwosu',
      email: 'driver@example.com',
      password_hash: passwordHash,
      role: 'driver',
    },
  ]);
};
