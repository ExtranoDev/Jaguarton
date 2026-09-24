const stationsService = require('./stations.service');
const asyncHandler = require('../../utils/asyncHandler');
const { contextFrom } = require('../audit/audit.service');

// Query values are already validated and converted to numbers by the route.
const list = asyncHandler(async (req, res) => {
  const { lat, lng, radiusKm, minPrice, maxPrice, status, connectorType } = req.query;
  const filters = {
    lat: lat ?? undefined,
    lng: lng ?? undefined,
    radiusKm: radiusKm ?? undefined,
    minPrice: minPrice ?? undefined,
    maxPrice: maxPrice ?? undefined,
    status: status || undefined,
    connectorType: connectorType || undefined,
  };
  const stations = await stationsService.listStations(filters, req.user);
  res.status(200).json({ stations });
});

const detail = asyncHandler(async (req, res) => {
  const station = await stationsService.getStationDetail(req.params.id, req.user);
  res.status(200).json({ station });
});

const create = asyncHandler(async (req, res) => {
  const { name, address, lat, lng } = req.body;
  const station = await stationsService.createStation(req.user.id, { name, address, lat, lng }, contextFrom(req));
  res.status(201).json({ station });
});

const update = asyncHandler(async (req, res) => {
  const { name, address, lat, lng } = req.body;
  const station = await stationsService.updateStation(req.params.id, req.user.id, { name, address, lat, lng }, contextFrom(req));
  res.status(200).json({ station });
});

const archive = asyncHandler(async (req, res) => {
  const station = await stationsService.setStationArchived(req.params.id, req.user.id, req.body.archived, contextFrom(req));
  res.status(200).json({ station });
});

const mine = asyncHandler(async (req, res) => {
  const stations = await stationsService.listOperatorStations(req.user.id);
  res.status(200).json({ stations });
});

module.exports = { list, detail, create, update, archive, mine };
