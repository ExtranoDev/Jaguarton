exports.up = function up(knex) {
  return knex.schema.createTable('stations', (table) => {
    table.increments('id').primary();
    table.integer('owner_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('address').notNullable();
    table.decimal('lat', 9, 6).notNullable();
    table.decimal('lng', 9, 6).notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('stations');
};
