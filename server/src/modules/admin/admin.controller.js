const adminService = require('./admin.service');
const asyncHandler = require('../../utils/asyncHandler');

const optionalInt = (value) => (value ? Number(value) : undefined);

const overview = asyncHandler(async (req, res) => {
  res.status(200).json({ overview: await adminService.getOverview() });
});

const listUsers = asyncHandler(async (req, res) => {
  const users = await adminService.listUsers({ role: req.query.role || undefined, q: req.query.q?.trim() || undefined });
  res.status(200).json({ users });
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, role, password } = req.body;
  const user = await adminService.createUser(req.user.id, { name, email, role, password });
  res.status(201).json({ user });
});

const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role } = req.body;
  const user = await adminService.updateUser(req.user.id, Number(req.params.id), { name, email, role });
  res.status(200).json({ user });
});

const resetUserPassword = asyncHandler(async (req, res) => {
  const { user, temporaryPassword } = await adminService.resetUserPassword(req.user.id, Number(req.params.id), {
    password: req.body.password,
  });
  res.status(200).json({ user, temporaryPassword });
});

const setUserActive = asyncHandler(async (req, res) => {
  const user = await adminService.setUserActive(req.user.id, Number(req.params.id), req.body.isActive);
  res.status(200).json({ user });
});

const listStations = asyncHandler(async (req, res) => {
  res.status(200).json({ stations: await adminService.listStations() });
});

const setStationActive = asyncHandler(async (req, res) => {
  const station = await adminService.setStationActive(req.user.id, Number(req.params.id), req.body.isActive);
  res.status(200).json({ station });
});

const setChargerStatus = asyncHandler(async (req, res) => {
  const charger = await adminService.setChargerStatus(req.user.id, Number(req.params.id), req.body.status);
  res.status(200).json({ charger });
});

const listBookings = asyncHandler(async (req, res) => {
  const { status, date } = req.query;
  const bookings = await adminService.listBookings({
    status: status || undefined,
    stationId: optionalInt(req.query.stationId),
    date: date || undefined,
  });
  res.status(200).json({ bookings });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await adminService.cancelBooking(req.user.id, Number(req.params.id), req.body.reason);
  res.status(200).json({ booking });
});

const slotCoverage = asyncHandler(async (req, res) => {
  const coverage = await adminService.getSlotCoverage({ days: optionalInt(req.query.days) });
  res.status(200).json({ coverage });
});

const topUpSlots = asyncHandler(async (req, res) => {
  const result = await adminService.topUpAllSlots(req.user.id, { days: optionalInt(req.body.days) });
  res.status(200).json(result);
});

const auditLog = asyncHandler(async (req, res) => {
  const actions = await adminService.listAuditLog({ limit: optionalInt(req.query.limit) });
  res.status(200).json({ actions });
});

module.exports = {
  overview,
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  setUserActive,
  listStations,
  setStationActive,
  setChargerStatus,
  listBookings,
  cancelBooking,
  slotCoverage,
  topUpSlots,
  auditLog,
};
