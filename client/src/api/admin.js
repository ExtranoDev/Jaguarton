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

// A reason is required to suspend (optional to reactivate).
export async function setUserActive(id, isActive, reason) {
  const { data } = await client.patch(`/admin/users/${id}`, clean({ isActive, reason }));
  return data.user;
}

// approval: '' (all), 'pending', 'approved', 'rejected' or 'archived'.
export async function listStations({ approval } = {}) {
  const { data } = await client.get('/admin/stations', { params: clean({ approval }) });
  return data.stations;
}

// A reason is required to deactivate (optional to reactivate).
export async function setStationActive(id, isActive, reason) {
  const { data } = await client.patch(`/admin/stations/${id}`, clean({ isActive, reason }));
  return data.station;
}

// Like the operator's: pass confirm = true after a 409 CONFIRM_REQUIRED.
export async function setChargerStatus(id, status, confirm = false) {
  const { data } = await client.patch(`/admin/chargers/${id}/status`, confirm ? { status, confirm } : { status });
  return data.charger;
}

// decision: 'approve' | 'reject' (a reject needs a reason).
export async function reviewStation(id, decision, reason) {
  const { data } = await client.patch(`/admin/stations/${id}/approval`, clean({ decision, reason }));
  return data.station;
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

// { entries, total, page, pageSize, actions } for the filters (actor, action, category, target,
// from, to as YYYY-MM-DD) and page.
export async function listAuditLog(filters = {}) {
  const { data } = await client.get('/admin/audit-log', { params: clean(filters) });
  return data;
}

export async function createUser({ name, email, role, password }) {
  const { data } = await client.post('/admin/users', { name, email, role, password });
  return data.user;
}

// `reason` is required when the role changes.
export async function updateUser(id, { name, email, role, reason }) {
  const { data } = await client.put(`/admin/users/${id}`, clean({ name, email, role, reason }));
  return data.user;
}

// Omit `password` to have the server generate a temporary one (returned once as temporaryPassword).
// A reason is required.
export async function resetUserPassword(id, password, reason) {
  const { data } = await client.post(`/admin/users/${id}/reset-password`, clean({ password, reason }));
  return data;
}
