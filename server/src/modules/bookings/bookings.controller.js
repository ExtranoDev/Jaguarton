const bookingsService = require('./bookings.service');
const asyncHandler = require('../../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const booking = await bookingsService.createBooking({ slotId: req.body.slotId, userId: req.user.id });
  res.status(201).json({ booking, bookingReference: booking.booking_reference });
});

const mine = asyncHandler(async (req, res) => {
  const bookings = await bookingsService.listMyBookings(req.user.id);
  res.status(200).json({ bookings });
});

const detail = asyncHandler(async (req, res) => {
  const booking = await bookingsService.getBookingById(req.params.id, req.user);
  res.status(200).json({ booking });
});

const cancel = asyncHandler(async (req, res) => {
  const booking = await bookingsService.cancelBooking(req.params.id, req.user.id);
  res.status(200).json({ booking });
});

const operatorList = asyncHandler(async (req, res) => {
  const { stationId, chargerId, status } = req.query;
  const bookings = await bookingsService.listOperatorBookings(req.user.id, {
    stationId: stationId || undefined,
    chargerId: chargerId || undefined,
    status: status || undefined,
  });
  res.status(200).json({ bookings });
});

module.exports = { create, mine, detail, cancel, operatorList };
