const db = require('../../config/db');
const { NotFoundError, ConflictError } = require('../../utils/errors');
const stationsService = require('../stations/stations.service');
const audit = require('../audit/audit.service');
const { countUpcomingBookings } = require('../bookings/upcoming');

const CHARGER_FIELDS = ['connector_type', 'power_kw', 'price_per_kwh', 'status'];
const { toCharger } = stationsService;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Returns the charger and its station (the station is needed for audit entries).
async function assertOwnsCharger(chargerId, userId, conn = db) {
  const charger = await conn('chargers').where({ id: chargerId }).first();
  if (!charger) throw new NotFoundError('Charger not found');
  const station = await stationsService.assertOwnsStation(charger.station_id, userId, conn);
  return { charger, station };
}

function assertChargerNotArchived(charger) {
  if (charger.archived_at != null) throw new ConflictError('This charger is archived. Restore it before changing it');
}

// Taking a charger offline or unavailable doesn't cancel anyone's booking, so when there are
// upcoming confirmed bookings the caller must confirm (confirm: true) after seeing how many.
// The count is kept in the audit entry. Used by operators and admins alike.
async function changeChargerStatus(trx, { charger, station, status, confirm = false, context = {} }) {
  if (charger.status === status) return toCharger(charger);
  const upcoming = status === 'online' ? 0 : await countUpcomingBookings(trx, { chargerId: charger.id });
  if (upcoming > 0 && confirm !== true) {
    throw new ConflictError(
      `This charger has ${plural(upcoming, 'upcoming booking')}. They stay booked, but drivers can't book it while it is ${status}. Confirm to go ahead`,
      { code: 'CONFIRM_REQUIRED', upcomingBookings: upcoming }
    );
  }
  const [updated] = await trx('chargers').where({ id: charger.id }).update({ status, updated_at: trx.fn.now() }).returning('*');
  await audit.record(trx, {
    action: 'charger.status',
    context,
    target: audit.chargerTarget(updated, station),
    ...audit.atStation(station),
    changes: audit.diff(charger, updated, ['status']),
    details: upcoming > 0 ? { upcomingBookings: upcoming } : null,
  });
  return toCharger(updated);
}

async function createCharger(stationId, ownerId, { connectorType, powerKw, pricePerKwh, status }, context = {}) {
  return db.transaction(async (trx) => {
    const station = await stationsService.assertOwnsStation(stationId, ownerId, trx);
    stationsService.assertNotArchived(station);
    const [charger] = await trx('chargers')
      .insert({
        station_id: stationId,
        connector_type: connectorType,
        power_kw: powerKw,
        price_per_kwh: pricePerKwh,
        status: status || 'online',
      })
      .returning('*');
    await audit.record(trx, {
      action: 'charger.create',
      context,
      target: audit.chargerTarget(charger, station),
      ...audit.atStation(station),
      changes: audit.diff({}, charger, CHARGER_FIELDS),
    });
    return toCharger(charger);
  });
}

async function updateCharger(chargerId, ownerId, { connectorType, powerKw, pricePerKwh, status, confirm }, context = {}) {
  return db.transaction(async (trx) => {
    const { charger: before, station } = await assertOwnsCharger(chargerId, ownerId, trx);
    assertChargerNotArchived(before);
    // A status change goes through the same confirmation as PATCH .../status.
    const afterStatus = status && status !== before.status
      ? await changeChargerStatus(trx, { charger: before, station, status, confirm, context })
      : before;
    const [charger] = await trx('chargers')
      .where({ id: chargerId })
      .update({ connector_type: connectorType, power_kw: powerKw, price_per_kwh: pricePerKwh, updated_at: trx.fn.now() })
      .returning('*');
    const changes = audit.diff(afterStatus, charger, ['connector_type', 'power_kw', 'price_per_kwh']);
    if (changes) {
      await audit.record(trx, { action: 'charger.update', context, target: audit.chargerTarget(charger, station), ...audit.atStation(station), changes });
    }
    return toCharger(charger);
  });
}

async function updateChargerStatus(chargerId, ownerId, status, { confirm = false } = {}, context = {}) {
  return db.transaction(async (trx) => {
    const { charger, station } = await assertOwnsCharger(chargerId, ownerId, trx);
    assertChargerNotArchived(charger);
    return changeChargerStatus(trx, { charger, station, status, confirm, context });
  });
}

// Like archiving a station: hidden and unbookable, history kept, restorable. Refused while drivers
// are booked on it.
async function setChargerArchived(chargerId, ownerId, archived, context = {}) {
  return db.transaction(async (trx) => {
    const { charger, station } = await assertOwnsCharger(chargerId, ownerId, trx);
    if ((charger.archived_at != null) === archived) return toCharger(charger);
    if (archived) {
      const upcoming = await countUpcomingBookings(trx, { chargerId });
      if (upcoming > 0) {
        throw new ConflictError(
          `This charger has ${plural(upcoming, 'upcoming booking')}. Cancel ${upcoming === 1 ? 'it' : 'them'} before archiving the charger`,
          { code: 'HAS_UPCOMING_BOOKINGS', upcomingBookings: upcoming }
        );
      }
    }
    const [updated] = await trx('chargers')
      .where({ id: chargerId })
      .update({ archived_at: archived ? new Date().toISOString() : null, updated_at: trx.fn.now() })
      .returning('*');
    await audit.record(trx, {
      action: archived ? 'charger.archive' : 'charger.unarchive',
      context,
      target: audit.chargerTarget(updated, station),
      ...audit.atStation(station),
      changes: { archived: { from: !archived, to: archived } },
    });
    return toCharger(updated);
  });
}

module.exports = {
  createCharger,
  updateCharger,
  updateChargerStatus,
  setChargerArchived,
  changeChargerStatus,
  assertOwnsCharger,
  assertChargerNotArchived,
};
