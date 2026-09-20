export function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nextDays(count) {
  return Array.from({ length: count }, (_, i) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    return day;
  });
}

function shortDate(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function dayLabel(date, index) {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return shortDate(date);
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatTimeRange(startIso, endIso) {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

export function formatDateTimeRange(startIso, endIso) {
  const start = new Date(startIso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  let day = shortDate(start);
  if (toLocalDateString(start) === toLocalDateString(today)) day = 'Today';
  else if (toLocalDateString(start) === toLocalDateString(tomorrow)) day = 'Tomorrow';

  return `${day}, ${formatTimeRange(startIso, endIso)}`;
}

export function formatNaira(amount) {
  return `₦${Number(amount).toFixed(2)}`;
}

export const CONNECTOR_LABELS = {
  Type2_AC: 'Type 2 · AC',
  CCS2_DC: 'CCS2 · DC Fast',
  CHAdeMO_DC: 'CHAdeMO · DC Fast',
};

// "Sat 26 Sep" for a YYYY-MM-DD string, read as that calendar day whatever the browser's timezone.
export function formatDayShort(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// "Sat 26": compact enough for a chip.
export function formatDayCompact(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}
