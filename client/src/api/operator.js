import client from './client';

export async function listOperatorStations() {
  const { data } = await client.get('/operator/stations');
  return data.stations;
}

export async function createStation({ name, address, lat, lng }) {
  const { data } = await client.post('/stations', { name, address, lat, lng });
  return data.station;
}

// Editing a rejected station resubmits it for approval.
export async function updateStation(id, { name, address, lat, lng }) {
  const { data } = await client.put(`/stations/${id}`, { name, address, lat, lng });
  return data.station;
}

// Refused (409, code HAS_UPCOMING_BOOKINGS) while drivers are booked on it.
export async function setStationArchived(id, archived) {
  const { data } = await client.patch(`/stations/${id}/archive`, { archived });
  return data.station;
}

export async function setChargerArchived(id, archived) {
  const { data } = await client.patch(`/chargers/${id}/archive`, { archived });
  return data.charger;
}

export async function addCharger(stationId, { connectorType, powerKw, pricePerKwh }) {
  const { data } = await client.post(`/stations/${stationId}/chargers`, {
    connectorType,
    powerKw,
    pricePerKwh,
  });
  return data.charger;
}

export async function updateCharger(id, { connectorType, powerKw, pricePerKwh }) {
  const { data } = await client.put(`/chargers/${id}`, { connectorType, powerKw, pricePerKwh });
  return data.charger;
}

// With upcoming bookings, going offline/unavailable is refused (409, code CONFIRM_REQUIRED,
// upcomingBookings) until it is sent again with confirm = true.
export async function setChargerStatus(id, status, confirm = false) {
  const { data } = await client.patch(`/chargers/${id}/status`, confirm ? { status, confirm } : { status });
  return data.charger;
}

// A reason (5+ characters) is required; it is kept in the audit log.
export async function cancelOperatorBooking(id, reason) {
  const { data } = await client.patch(`/operator/bookings/${id}/cancel`, { reason });
  return data.booking;
}

export async function topUpSlots({ days = 7, stationId } = {}) {
  const { data } = await client.post('/operator/slots/top-up', { days, stationId });
  return data;
}

// { entries, total, page, pageSize }: what happened at the operator's stations, newest first.
export async function listOperatorHistory({ stationId, page } = {}) {
  const { data } = await client.get('/operator/history', { params: { stationId, page } });
  return data;
}

export async function listOperatorBookings({ stationId, status } = {}) {
  const { data } = await client.get('/operator/bookings', { params: { stationId, status } });
  return data.bookings;
}
