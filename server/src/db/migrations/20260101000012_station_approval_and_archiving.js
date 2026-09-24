// Station approval and archiving.
//   stations.approval_status  'pending' | 'approved' | 'rejected'. Defaults to 'approved', so every
//                             existing and seeded station stays live; the API creates new stations
//                             as 'pending' until an admin approves them.
//   stations.review_note      the admin's reason when a station is rejected, shown to its operator.
//   stations.archived_at, chargers.archived_at
//                             set when an operator archives one: hidden and unbookable, but kept
//                             (with its slots, bookings and audit history) and restorable.
// Plain columns without CHECK constraints (the app validates the values), added with ALTER TABLE ADD
// COLUMN, so SQLite never rebuilds a table. Safe to re-run: each column is added only if missing.

const COLUMNS = [
  ['stations', 'approval_status', (table) => table.string('approval_status', 16).notNullable().defaultTo('approved')],
  ['stations', 'review_note', (table) => table.text('review_note')],
  ['stations', 'archived_at', (table) => table.timestamp('archived_at')],
  ['chargers', 'archived_at', (table) => table.timestamp('archived_at')],
];

exports.up = async function up(knex) {
  for (const [tableName, column, add] of COLUMNS) {
    if (!(await knex.schema.hasColumn(tableName, column))) {
      await knex.schema.alterTable(tableName, (table) => add(table));
    }
  }
};

// Plain DROP COLUMN, as in migration 8, so SQLite doesn't rebuild (and cascade from) the tables.
exports.down = async function down(knex) {
  for (const [tableName, column] of [...COLUMNS].reverse()) {
    if (await knex.schema.hasColumn(tableName, column)) {
      await knex.raw(`ALTER TABLE ${tableName} DROP COLUMN ${column}`);
    }
  }
};
