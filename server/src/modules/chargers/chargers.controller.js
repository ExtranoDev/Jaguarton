const chargersService = require('./chargers.service');
const asyncHandler = require('../../utils/asyncHandler');
const { contextFrom } = require('../audit/audit.service');

const create = asyncHandler(async (req, res) => {
  const { connectorType, powerKw, pricePerKwh, status } = req.body;
  const charger = await chargersService.createCharger(
    req.params.stationId,
    req.user.id,
    { connectorType, powerKw, pricePerKwh, status },
    contextFrom(req)
  );
  res.status(201).json({ charger });
});

const update = asyncHandler(async (req, res) => {
  const { connectorType, powerKw, pricePerKwh, status, confirm } = req.body;
  const charger = await chargersService.updateCharger(
    req.params.id,
    req.user.id,
    { connectorType, powerKw, pricePerKwh, status, confirm },
    contextFrom(req)
  );
  res.status(200).json({ charger });
});

const updateStatus = asyncHandler(async (req, res) => {
  const charger = await chargersService.updateChargerStatus(req.params.id, req.user.id, req.body.status, { confirm: req.body.confirm }, contextFrom(req));
  res.status(200).json({ charger });
});

const archive = asyncHandler(async (req, res) => {
  const charger = await chargersService.setChargerArchived(req.params.id, req.user.id, req.body.archived, contextFrom(req));
  res.status(200).json({ charger });
});

module.exports = { create, update, updateStatus, archive };
