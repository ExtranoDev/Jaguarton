// users.connector_types: the connector(s) a driver's car takes, as a JSON array of
// CONNECTOR_TYPES values (e.g. '["Type2_AC","CCS2_DC"]'). NULL means "not set", so every
// existing account keeps seeing every charger. Plain text rather than a JSON column type so it
// behaves the same on SQLite and Postgres; the app validates and parses it.
// Added with ALTER TABLE ADD COLUMN, so SQLite never rebuilds (and cascades from) users. Safe to
// re-run: the column is added only if missing.

exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('users', 'connector_types'))) {
    await knex.schema.alterTable('users', (table) => {
      table.text('connector_types');
    });
  }
};

// Plain DROP COLUMN, as in migration 8, so SQLite doesn't rebuild the table.
exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('users', 'connector_types')) {
    await knex.raw('ALTER TABLE users DROP COLUMN connector_types');
  }
};
