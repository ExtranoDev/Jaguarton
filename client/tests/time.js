import { addDays, toLagosDateString } from '../src/utils/format.js';

// hour:00 in Lagos, `days` days from today in Lagos, as an ISO string: what the API sends for a
// slot. Built this way, the tests pass whatever timezone the machine running them is in.
export function lagosIso(days, hour) {
  const date = addDays(toLagosDateString(), days);
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+01:00`).toISOString();
}
