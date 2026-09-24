// Confirmed bookings whose slot hasn't started yet, for one charger or one station. Used to warn
// before taking a charger offline and to refuse archiving something people are booked on.
async function countUpcomingBookings(conn, { chargerId, stationId }) {
  let query = conn('bookings as b')
    .innerJoin('slots as sl', 'sl.id', 'b.slot_id')
    .where('b.status', 'confirmed')
    .andWhere('sl.start_time', '>', new Date().toISOString());
  if (chargerId) query = query.andWhere('b.charger_id', chargerId);
  if (stationId) query = query.andWhere('b.station_id', stationId);
  const row = await query.count('* as n').first();
  return Number(row?.n || 0);
}

module.exports = { countUpcomingBookings };
