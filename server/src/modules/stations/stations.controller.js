const stationsService = require('./stations.service');
const asyncHandler = require('../../utils/asyncHandler');

function parseFloatOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const list = asyncHandler(async (req, res) => {
  const filters = {
    lat: parseFloatOrUndefined(req.query.lat),
    lng: parseFloatOrUndefined(req.query.lng),
    radiusKm: parseFloatOrUndefined(req.query.radiusKm),
    minPrice: parseFloatOrUndefined(req.query.minPrice),
    maxPrice: parseFloatOrUndefined(req.query.maxPrice),
    status: req.query.status || undefined,
    connectorType: req.query.connectorType || undefined,
  };
  const stations = await stationsService.listStations(filters, req.user);
  res.status(200).json({ stations });
});

const detail = asyncHandler(async (req, res) => {
  const station = await stationsService.getStationDetail(Number(req.params.id), req.user);
  res.status(200).json({ station });
});

const create = asyncHandler(async (req, res) => {
  const { name, address, lat, lng } = req.body;
  const station = await stationsService.createStation(req.user.id, { name, address, lat, lng });
  res.status(201).json({ station });
});

const update = asyncHandler(async (req, res) => {
  const { name, address, lat, lng } = req.body;
  const station = await stationsService.updateStation(Number(req.params.id), req.user.id, {
    name,
    address,
    lat,
    lng,
  });
  res.status(200).json({ station });
});

const mine = asyncHandler(async (req, res) => {
  const stations = await stationsService.listOperatorStations(req.user.id);
  res.status(200).json({ stations });
});

module.exports = { list, detail, create, update, mine };
