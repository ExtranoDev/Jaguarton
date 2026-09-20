// Audit trail of what admins did. `target` is "<type>:<id>" (e.g. "user:12") so it can be
// resolved to a readable name when listing. RESTRICT: an admin with history can't be
// deleted out from under their audit entries.
exports.up = function up(knex) {
  return knex.schema.createTable('admin_actions', (table) => {
    table.increments('id').primary();
    table.integer('admin_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    table.string('action').notNullable();
    table.string('target').notNullable();
    table.text('reason');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['created_at']);
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('admin_actions');
};
