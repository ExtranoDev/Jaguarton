import client from './client';

export async function listStations(filters = {}) {
  const params = {};
  if (filters.lat != null) params.lat = filters.lat;
  if (filters.lng != null) params.lng = filters.lng;
  if (filters.radiusKm != null) params.radiusKm = filters.radiusKm;
  if (filters.minPrice != null) params.minPrice = filters.minPrice;
  if (filters.maxPrice != null) params.maxPrice = filters.maxPrice;
  if (filters.status) params.status = filters.status;
  if (filters.connectorType) params.connectorType = filters.connectorType;

  const { data } = await client.get('/stations', { params });
  return data.stations;
}

export async function getStation(id) {
  const { data } = await client.get(`/stations/${id}`);
  return data.station;
}
