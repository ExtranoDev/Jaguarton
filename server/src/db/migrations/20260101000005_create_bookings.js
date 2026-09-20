exports.up = function up(knex) {
  return knex.schema.createTable('bookings', (table) => {
    table.increments('id').primary();
    table.integer('slot_id').unsigned().notNullable()
      .references('id').inTable('slots').onDelete('RESTRICT');
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    // Denormalized for fast operator "bookings for my stations" queries.
    table.integer('charger_id').unsigned().notNullable();
    table.integer('station_id').unsigned().notNullable();
    table.string('booking_reference', 20).notNullable().unique();
    table.enu('status', ['confirmed', 'cancelled'], {
      useNative: false,
      enumName: null,
    }).notNullable().defaultTo('confirmed');
    table.decimal('price_at_booking', 8, 2).notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('bookings');
};
