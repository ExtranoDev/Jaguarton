const chargersService = require('./chargers.service');
const asyncHandler = require('../../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const { connectorType, powerKw, pricePerKwh, status } = req.body;
  const charger = await chargersService.createCharger(Number(req.params.stationId), req.user.id, {
    connectorType,
    powerKw,
    pricePerKwh,
    status,
  });
  res.status(201).json({ charger });
});

const update = asyncHandler(async (req, res) => {
  const { connectorType, powerKw, pricePerKwh, status } = req.body;
  const charger = await chargersService.updateCharger(Number(req.params.id), req.user.id, {
    connectorType,
    powerKw,
    pricePerKwh,
    status,
  });
  res.status(200).json({ charger });
});

const updateStatus = asyncHandler(async (req, res) => {
  const charger = await chargersService.updateChargerStatus(
    Number(req.params.id),
    req.user.id,
    req.body.status
  );
  res.status(200).json({ charger });
});

module.exports = { create, update, updateStatus };
