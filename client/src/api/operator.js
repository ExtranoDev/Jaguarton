import client from './client';

export async function listOperatorStations() {
  const { data } = await client.get('/operator/stations');
  return data.stations;
}

export async function createStation({ name, address, lat, lng }) {
  const { data } = await client.post('/stations', { name, address, lat, lng });
  return data.station;
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

export async function setChargerStatus(id, status) {
  const { data } = await client.patch(`/chargers/${id}/status`, { status });
  return data.charger;
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
