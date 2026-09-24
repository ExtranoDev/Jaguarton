// Every date and time the app shows is Lagos time (WAT, UTC+1 all year), whatever the browser's
// timezone, matching the server's APP_TIMEZONE: a slot at 10:00 is 10:00 in Lagos, and "Today" is
// today in Lagos. Calendar days travel as YYYY-MM-DD strings, never as local Date objects.
export const APP_TIME_ZONE = 'Africa/Lagos';

const DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The Lagos calendar day (YYYY-MM-DD) that an instant falls on.
export function toLagosDateString(date = new Date()) {
  const parts = Object.fromEntries(DATE_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Calendar arithmetic on YYYY-MM-DD strings (done in UTC, so no DST or local-offset surprises).
export function addDays(dateStr, count) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + count)).toISOString().slice(0, 10);
}

// Today and the following days in Lagos, as YYYY-MM-DD strings.
export function nextDays(count, now = new Date()) {
  const today = toLagosDateString(now);
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

// Midday in Lagos on that day: an instant that formats as that calendar day in Lagos.
const middayInLagos = (dateStr) => new Date(`${dateStr}T12:00:00+01:00`);

const lagosFormat = (options) => new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, ...options });
const SHORT_DAY = lagosFormat({ weekday: 'short', day: 'numeric', month: 'short' });
const COMPACT_DAY = lagosFormat({ weekday: 'short', day: 'numeric' });
const DATE_ONLY = lagosFormat({ day: 'numeric', month: 'short', year: 'numeric' });
const TIME = lagosFormat({ hour: '2-digit', minute: '2-digit', hour12: false });
const DATE_TIME = lagosFormat({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

// "Sat 26 Sep" for a YYYY-MM-DD string.
export function formatDayShort(dateStr) {
  return SHORT_DAY.format(middayInLagos(dateStr));
}

// "Sat 26": compact enough for a chip.
export function formatDayCompact(dateStr) {
  return COMPACT_DAY.format(middayInLagos(dateStr));
}

// "Today", "Tomorrow", then "Sat 26 Sep", for the day tabs built from nextDays().
export function dayLabel(dateStr, index) {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return formatDayShort(dateStr);
}

export function formatTime(iso) {
  return TIME.format(new Date(iso));
}

export function formatTimeRange(startIso, endIso) {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

export function formatDateTimeRange(startIso, endIso) {
  const startDay = toLagosDateString(new Date(startIso));
  const today = toLagosDateString();
  let day = formatDayShort(startDay);
  if (startDay === today) day = 'Today';
  else if (startDay === addDays(today, 1)) day = 'Tomorrow';
  return `${day}, ${formatTimeRange(startIso, endIso)}`;
}

// "24 Sep 2026"
export function formatDate(iso) {
  return DATE_ONLY.format(new Date(iso));
}

export function formatDateTime(iso) {
  return DATE_TIME.format(new Date(iso));
}

export function formatNaira(amount) {
  return `₦${Number(amount).toFixed(2)}`;
}

export const CONNECTOR_TYPES = ['Type2_AC', 'CCS2_DC', 'CHAdeMO_DC'];

export const CONNECTOR_LABELS = {
  Type2_AC: 'Type 2 · AC',
  CCS2_DC: 'CCS2 · DC Fast',
  CHAdeMO_DC: 'CHAdeMO · DC Fast',
};

// "24 Sep 2026, 14:05" in Lagos time: for records such as the audit log, where the year and exact
// time matter.
const FULL_DATE_TIME = lagosFormat({
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
export function formatDateTimeFull(iso) {
  return FULL_DATE_TIME.format(new Date(iso));
}
