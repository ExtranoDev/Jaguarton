import client from './client';

export async function getSlots(chargerId, date) {
  const { data } = await client.get(`/chargers/${chargerId}/slots`, { params: { date } });
  return data.slots;
}
