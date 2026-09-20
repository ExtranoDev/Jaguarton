import client from './client';

export async function createBooking(slotId) {
  const { data } = await client.post('/bookings', { slotId });
  return data.booking;
}

export async function listMyBookings() {
  const { data } = await client.get('/bookings/me');
  return data.bookings;
}

export async function getBooking(id) {
  const { data } = await client.get(`/bookings/${id}`);
  return data.booking;
}

export async function cancelBooking(id) {
  const { data } = await client.patch(`/bookings/${id}/cancel`);
  return data.booking;
}
