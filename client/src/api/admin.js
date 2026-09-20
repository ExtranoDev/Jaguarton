import client from './client';

// Empty filter values mean "no filter": leave them out of the query string.
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value != null));

export async function getOverview() {
  const { data } = await client.get('/admin/overview');
  return data.overview;
}

export async function listUsers({ role, q } = {}) {
  const { data } = await client.get('/admin/users', { params: clean({ role, q }) });
  return data.users;
}

export async function setUserActive(id, isActive) {
  const { data } = await client.patch(`/admin/users/${id}`, { isActive });
  return data.user;
}

export async function listStations() {
  const { data } = await client.get('/admin/stations');
  return data.stations;
}

export async function setStationActive(id, isActive) {
  const { data } = await client.patch(`/admin/stations/${id}`, { isActive });
  return data.station;
}

export async function setChargerStatus(id, status) {
  const { data } = await client.patch(`/admin/chargers/${id}/status`, { status });
  return data.charger;
}

export async function listBookings({ status, stationId, date } = {}) {
  const { data } = await client.get('/admin/bookings', { params: clean({ status, stationId, date }) });
  return data.bookings;
}

export async function cancelBooking(id, reason) {
  const { data } = await client.patch(`/admin/bookings/${id}/cancel`, { reason });
  return data.booking;
}

export async function getSlotCoverage(days = 7) {
  const { data } = await client.get('/admin/slot-coverage', { params: { days } });
  return data.coverage;
}

export async function topUpSlots(days = 7) {
  const { data } = await client.post('/admin/slots/top-up', { days });
  return data;
}

export async function listAuditLog() {
  const { data } = await client.get('/admin/audit-log');
  return data.actions;
}
