const { appTimezone } = require('../config/env');

// All "what day is it / what time is 08:00" logic goes through here so it is
// pinned to APP_TIMEZONE instead of whatever timezone the host process runs in.

const formatters = new Map();

function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  return formatters.get(timeZone);
}

function partsIn(date, timeZone) {
  const parts = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
}

// How far ahead of UTC the zone's wall clock is at this instant, in ms.
function offsetMs(utcMs, timeZone) {
  const p = partsIn(new Date(utcMs), timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(utcMs / 1000) * 1000;
}

// The instant at which the wall clock in `timeZone` reads dateStr hour:minute.
function zonedTimeToDate(dateStr, hour = 0, minute = 0, timeZone = appTimezone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hour, minute);
  // Two passes so the result is right on the side of a DST change too.
  const firstGuess = wallAsUtc - offsetMs(wallAsUtc, timeZone);
  return new Date(wallAsUtc - offsetMs(firstGuess, timeZone));
}

// YYYY-MM-DD of an instant as seen in `timeZone`.
function toZonedDateString(date = new Date(), timeZone = appTimezone) {
  const p = partsIn(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isValidDateString(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const roundTrip = new Date(Date.UTC(y, m - 1, d));
  return roundTrip.getUTCFullYear() === y && roundTrip.getUTCMonth() === m - 1 && roundTrip.getUTCDate() === d;
}

// [start, end) of a calendar day in `timeZone`, as instants.
function dayBounds(dateStr, timeZone = appTimezone) {
  return {
    start: zonedTimeToDate(dateStr, 0, 0, timeZone),
    end: zonedTimeToDate(addDaysToDateString(dateStr, 1), 0, 0, timeZone),
  };
}

// Postgres returns timestamps as Dates; SQLite's CURRENT_TIMESTAMP default stores
// "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker, which browsers would read as local
// time. This gives the API one unambiguous ISO-8601 shape on both engines.
function toIsoString(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}.000Z` : text;
}

// Fail fast at startup if APP_TIMEZONE is not a real IANA zone.
formatterFor(appTimezone);

module.exports = {
  zonedTimeToDate,
  toZonedDateString,
  addDaysToDateString,
  isValidDateString,
  dayBounds,
  toIsoString,
};
