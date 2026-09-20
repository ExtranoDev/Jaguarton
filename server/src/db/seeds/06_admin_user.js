const bcrypt = require('bcryptjs');

// Idempotent and non-destructive, unlike the other seeds (01_users wipes every table).
// It runs as part of `npm run seed`, and on its own via `npm run seed:admin` to add the
// admin to a database that already holds data you want to keep.
exports.seed = async function seed(knex) {
  const existing = await knex('users').where({ email: 'admin@example.com' }).first();
  if (existing) return;

  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD || 'password123', 10);
  await knex('users').insert({
    name: 'Ifeoma Balogun',
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
  });
};
