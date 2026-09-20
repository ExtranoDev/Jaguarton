// Soft-disable flags for the admin section. Existing rows stay active.
exports.up = async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.boolean('is_active').notNullable().defaultTo(true);
  });
  await knex.schema.alterTable('stations', (table) => {
    table.boolean('is_active').notNullable().defaultTo(true);
  });
};

// Plain DROP COLUMN (Postgres, and SQLite 3.35+) rather than knex's dropColumn: on SQLite
// knex rebuilds the table, and dropping a table that others reference ON DELETE CASCADE
// with foreign keys on would delete their rows.
exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE stations DROP COLUMN is_active');
  await knex.raw('ALTER TABLE users DROP COLUMN is_active');
};
