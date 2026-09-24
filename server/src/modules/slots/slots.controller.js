const slotsService = require('./slots.service');
const asyncHandler = require('../../utils/asyncHandler');
const { contextFrom } = require('../audit/audit.service');

const listForCharger = asyncHandler(async (req, res) => {
  const slots = await slotsService.getSlotsForCharger(req.params.id, req.query.date, req.user);
  res.status(200).json({ slots });
});

const generate = asyncHandler(async (req, res) => {
  const { date, startHour, endHour, durationMinutes } = req.body;
  const slots = await slotsService.generateSlots(req.params.id, req.user.id, { date, startHour, endHour, durationMinutes }, contextFrom(req));
  res.status(201).json({ slots });
});

const topUp = asyncHandler(async (req, res) => {
  const { days, stationId } = req.body;
  const result = await slotsService.topUpSlotsForOperator(
    req.user.id,
    { days: days || undefined, stationId: stationId || undefined },
    contextFrom(req)
  );
  res.status(200).json(result);
});

const updateStatus = asyncHandler(async (req, res) => {
  const blocked = req.body.status === 'blocked';
  const slot = await slotsService.setSlotBlocked(req.params.id, req.user.id, blocked, contextFrom(req));
  res.status(200).json({ slot });
});

const remove = asyncHandler(async (req, res) => {
  await slotsService.deleteSlot(req.params.id, req.user.id, contextFrom(req));
  res.status(204).send();
});

module.exports = { listForCharger, generate, topUp, updateStatus, remove };
