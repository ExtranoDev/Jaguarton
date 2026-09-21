const slotsService = require('./slots.service');
const asyncHandler = require('../../utils/asyncHandler');

const listForCharger = asyncHandler(async (req, res) => {
  const slots = await slotsService.getSlotsForCharger(Number(req.params.id), req.query.date, req.user);
  res.status(200).json({ slots });
});

const generate = asyncHandler(async (req, res) => {
  const { date, startHour, endHour, durationMinutes } = req.body;
  const slots = await slotsService.generateSlots(Number(req.params.id), req.user.id, {
    date,
    startHour,
    endHour,
    durationMinutes,
  });
  res.status(201).json({ slots });
});

const topUp = asyncHandler(async (req, res) => {
  const { days, stationId } = req.body;
  const result = await slotsService.topUpSlotsForOperator(req.user.id, {
    days: days ? Number(days) : undefined,
    stationId: stationId ? Number(stationId) : undefined,
  });
  res.status(200).json(result);
});

const updateStatus = asyncHandler(async (req, res) => {
  const blocked = req.body.status === 'blocked';
  const slot = await slotsService.setSlotBlocked(Number(req.params.id), req.user.id, blocked);
  res.status(200).json({ slot });
});

const remove = asyncHandler(async (req, res) => {
  await slotsService.deleteSlot(Number(req.params.id), req.user.id);
  res.status(204).send();
});

module.exports = { listForCharger, generate, topUp, updateStatus, remove };
