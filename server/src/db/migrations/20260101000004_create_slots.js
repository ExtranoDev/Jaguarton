exports.up = function up(knex) {
  return knex.schema.createTable('slots', (table) => {
    table.increments('id').primary();
    table.integer('charger_id').unsigned().notNullable()
      .references('id').inTable('chargers').onDelete('CASCADE');
    table.timestamp('start_time').notNullable();
    table.timestamp('end_time').notNullable();
    table.enu('status', ['available', 'booked', 'blocked'], {
      useNative: false,
      enumName: null,
    }).notNullable().defaultTo('available');
    table.timestamps(true, true);

    table.unique(['charger_id', 'start_time']);
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('slots');
};
