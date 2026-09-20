const { generateBookingReference } = require('../../utils/bookingReference');

// A couple of pre-existing bookings so the demo driver account has
// something in "My Bookings" without needing to book live first.
exports.seed = async function seed(knex) {
  const driver = await knex('users').where({ email: 'driver@example.com' }).first();
  if (!driver) {
    throw new Error('Driver user not found — run 01_users seed first');
  }

  const candidateSlots = await knex('slots')
    .join('chargers', 'slots.charger_id', 'chargers.id')
    .where('chargers.status', 'online')
    .andWhere('slots.status', 'available')
    .select(
      'slots.id as slot_id',
      'slots.charger_id as charger_id',
      'chargers.station_id as station_id',
      'chargers.price_per_kwh as price_per_kwh'
    )
    .orderBy('slots.id')
    .limit(2);

  for (const slot of candidateSlots) {
    await knex('bookings').insert({
      slot_id: slot.slot_id,
      user_id: driver.id,
      charger_id: slot.charger_id,
      station_id: slot.station_id,
      booking_reference: generateBookingReference(),
      status: 'confirmed',
      price_at_booking: slot.price_per_kwh,
    });

    await knex('slots').where({ id: slot.slot_id }).update({ status: 'booked' });
  }
};
