exports.up = function up(knex) {
  return knex.schema.createTable('chargers', (table) => {
    table.increments('id').primary();
    table.integer('station_id').unsigned().notNullable()
      .references('id').inTable('stations').onDelete('CASCADE');
    table.enu('connector_type', ['Type2_AC', 'CCS2_DC', 'CHAdeMO_DC'], {
      useNative: false,
      enumName: null,
    }).notNullable();
    table.decimal('power_kw', 6, 2).notNullable();
    table.decimal('price_per_kwh', 8, 2).notNullable();
    table.enu('status', ['online', 'offline', 'unavailable'], {
      useNative: false,
      enumName: null,
    }).notNullable().defaultTo('online');
    table.timestamps(true, true);
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('chargers');
};
