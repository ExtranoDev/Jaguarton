import client from './client';

// A signed-in operator gets every slot of their own chargers (whatever the charger's status);
// everyone else gets only bookable ones.
export async function getSlots(chargerId, date) {
  const { data } = await client.get(`/chargers/${chargerId}/slots`, { params: { date } });
  return data.slots;
}

export async function setSlotBlocked(id, blocked) {
  const { data } = await client.patch(`/slots/${id}`, { status: blocked ? 'blocked' : 'available' });
  return data.slot;
}
