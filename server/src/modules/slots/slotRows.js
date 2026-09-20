const { zonedTimeToDate } = require('../../utils/time');

const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20; // exclusive: the last hourly slot starts at 19:00
const DEFAULT_DURATION_MINUTES = 60;

// Slot rows for one charger on one calendar day (YYYY-MM-DD, in APP_TIMEZONE).
// Shared by the operator "generate slots" endpoint, the top-up job and the seed
// so they all agree on what a day of slots looks like.
function buildSlotRows(
  chargerId,
  dateStr,
  { startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR, durationMinutes = DEFAULT_DURATION_MINUTES } = {}
) {
  const stepMs = durationMinutes * 60 * 1000;
  const dayEnd = zonedTimeToDate(dateStr, endHour, 0).getTime();
  const rows = [];

  for (let cursor = zonedTimeToDate(dateStr, startHour, 0).getTime(); cursor + stepMs <= dayEnd; cursor += stepMs) {
    rows.push({
      charger_id: chargerId,
      start_time: new Date(cursor).toISOString(),
      end_time: new Date(cursor + stepMs).toISOString(),
      status: 'available',
    });
  }

  return rows;
}

module.exports = { buildSlotRows };
