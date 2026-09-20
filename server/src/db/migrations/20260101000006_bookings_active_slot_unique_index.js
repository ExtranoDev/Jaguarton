// Partial unique index: a slot can have at most one CONFIRMED booking, but a
// cancelled booking doesn't block the slot from being rebooked. This is a
// DB-level backstop against double-booking that holds even if application
// logic (transaction + row lock + conditional update) has a bug or races.
// The raw SQL is identical on SQLite (3.8+) and Postgres.
exports.up = function up(knex) {
  return knex.raw(`
    CREATE UNIQUE INDEX bookings_active_slot_unique
    ON bookings (slot_id)
    WHERE status = 'confirmed'
  `);
};

exports.down = function down(knex) {
  return knex.raw('DROP INDEX bookings_active_slot_unique');
};
