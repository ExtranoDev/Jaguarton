const bcrypt = require('bcryptjs');

exports.seed = async function seed(knex) {
  // Delete in FK-safe order (children before parents) so re-running the
  // seed is idempotent regardless of DB engine.
  await knex('admin_actions').del();
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
