const adminService = require('./admin.service');
const asyncHandler = require('../../utils/asyncHandler');
const { contextFrom } = require('../audit/audit.service');

const optionalInt = (value) => (value ? Number(value) : undefined);

const overview = asyncHandler(async (req, res) => {
  res.status(200).json({ overview: await adminService.getOverview() });
});

const listUsers = asyncHandler(async (req, res) => {
  const result = await adminService.listUsers({
    role: req.query.role || undefined,
    q: req.query.q?.trim() || undefined,
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 50,
  });
  res.status(200).json(result);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, role, password } = req.body;
  const user = await adminService.createUser(req.user.id, { name, email, role, password }, contextFrom(req));
  res.status(201).json({ user });
});

const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, reason } = req.body;
  const user = await adminService.updateUser(req.user.id, Number(req.params.id), { name, email, role, reason }, contextFrom(req));
  res.status(200).json({ user });
});

const resetUserPassword = asyncHandler(async (req, res) => {
  const { user, temporaryPassword } = await adminService.resetUserPassword(
    req.user.id,
    Number(req.params.id),
    { password: req.body.password, reason: req.body.reason },
    contextFrom(req)
  );
  res.status(200).json({ user, temporaryPassword });
});

const setUserActive = asyncHandler(async (req, res) => {
  const user = await adminService.setUserActive(req.user.id, Number(req.params.id), req.body.isActive, req.body.reason, contextFrom(req));
  res.status(200).json({ user });
});

const listStations = asyncHandler(async (req, res) => {
  res.status(200).json({ stations: await adminService.listStations({ approval: req.query.approval || undefined }) });
});

const setStationActive = asyncHandler(async (req, res) => {
  const station = await adminService.setStationActive(req.user.id, Number(req.params.id), req.body.isActive, req.body.reason, contextFrom(req));
  res.status(200).json({ station });
});

const setChargerStatus = asyncHandler(async (req, res) => {
  const charger = await adminService.setChargerStatus(req.user.id, Number(req.params.id), req.body.status, { confirm: req.body.confirm }, contextFrom(req));
  res.status(200).json({ charger });
});

const reviewStation = asyncHandler(async (req, res) => {
  const { decision, reason } = req.body;
  const station = await adminService.reviewStation(req.user.id, Number(req.params.id), { decision, reason }, contextFrom(req));
  res.status(200).json({ station });
});

const listBookings = asyncHandler(async (req, res) => {
  const { status, date } = req.query;
  const result = await adminService.listBookings({
    status: status || undefined,
    stationId: optionalInt(req.query.stationId),
    date: date || undefined,
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 50,
  });
  res.status(200).json(result);
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await adminService.cancelBooking(req.user.id, Number(req.params.id), req.body.reason, contextFrom(req));
  res.status(200).json({ booking });
});

const slotCoverage = asyncHandler(async (req, res) => {
  const coverage = await adminService.getSlotCoverage({ days: optionalInt(req.query.days) });
  res.status(200).json({ coverage });
});

const topUpSlots = asyncHandler(async (req, res) => {
  const result = await adminService.topUpAllSlots(req.user.id, { days: optionalInt(req.body.days) }, contextFrom(req));
  res.status(200).json(result);
});

const auditLog = asyncHandler(async (req, res) => {
  const { actor, action, category, target, from, to, page, pageSize } = req.query;
  const result = await adminService.listAuditLog({
    actor: actor || undefined,
    action: action || undefined,
    category: category || undefined,
    target: target || undefined,
    from: from || undefined,
    to: to || undefined,
    page: page || 1,
    pageSize: pageSize || 50,
  });
  res.status(200).json(result);
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
  reviewStation,
  listBookings,
  cancelBooking,
  slotCoverage,
  topUpSlots,
  auditLog,
};
