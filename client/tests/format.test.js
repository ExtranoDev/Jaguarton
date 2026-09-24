import { addDays, dayLabel, formatDate, formatDateTimeRange, formatTime, nextDays, toLagosDateString } from '../src/utils/format.js';

// Instants chosen so that Lagos (UTC+1) and UTC disagree about the day or the hour: these pass
// only if the formatters use Lagos time rather than the machine's timezone.
describe('Lagos time', () => {
  it('puts an instant on its Lagos calendar day', () => {
    expect(toLagosDateString(new Date('2026-09-24T23:30:00Z'))).toBe('2026-09-25');
    expect(toLagosDateString(new Date('2026-09-24T22:59:00Z'))).toBe('2026-09-24');
  });

  it('formats times and dates in Lagos', () => {
    expect(formatTime('2026-09-24T09:00:00Z')).toBe('10:00');
    expect(formatTime('2026-09-24T23:15:00Z')).toBe('00:15');
    expect(formatDate('2026-12-31T23:30:00Z')).toBe('1 Jan 2027');
  });

  it('builds the day tabs from the Lagos date, across month and year ends', () => {
    expect(nextDays(3, new Date('2026-12-30T23:30:00Z'))).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
    expect(nextDays(7)).toHaveLength(7);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(dayLabel('2026-09-26', 0)).toBe('Today');
    expect(dayLabel('2026-09-26', 1)).toBe('Tomorrow');
    expect(dayLabel('2026-10-03', 2)).toBe('Sat 3 Oct');
  });

  it('says Today/Tomorrow by the Lagos day', () => {
    const today = toLagosDateString();
    const at = (date, hour) => new Date(`${date}T${hour}:00:00+01:00`).toISOString();
    expect(formatDateTimeRange(at(today, '10'), at(today, '11'))).toBe('Today, 10:00 – 11:00');
    expect(formatDateTimeRange(at(addDays(today, 1), '08'), at(addDays(today, 1), '09'))).toBe('Tomorrow, 08:00 – 09:00');
  });
});

describe('audit change text', () => {
  it("reads a driver's connector change as labels", async () => {
    const { describeChanges } = await import('../src/utils/audit.js');
    expect(describeChanges({ connector_types: { from: [], to: ['Type2_AC', 'CCS2_DC'] } })).toEqual([
      "Car's connectors: none → Type 2 · AC, CCS2 · DC Fast",
    ]);
  });
});
