const {
  zonedTimeToDate,
  toZonedDateString,
  addDaysToDateString,
  isValidDateString,
  dayBounds,
} = require('../src/utils/time');

describe('zonedTimeToDate', () => {
  it('converts a Lagos wall-clock time (UTC+1) to the right instant', () => {
    expect(zonedTimeToDate('2026-09-23', 8, 0, 'Africa/Lagos').toISOString()).toBe('2026-09-23T07:00:00.000Z');
  });

  it('is a no-op for UTC', () => {
    expect(zonedTimeToDate('2026-09-23', 8, 0, 'UTC').toISOString()).toBe('2026-09-23T08:00:00.000Z');
  });

  it('handles half-hour offsets', () => {
    expect(zonedTimeToDate('2026-09-23', 8, 0, 'Asia/Kolkata').toISOString()).toBe('2026-09-23T02:30:00.000Z');
  });

  it('follows daylight saving in zones that have it', () => {
    expect(zonedTimeToDate('2026-01-15', 8, 0, 'America/New_York').toISOString()).toBe('2026-01-15T13:00:00.000Z');
    expect(zonedTimeToDate('2026-07-01', 8, 0, 'America/New_York').toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('treats hour 24 as midnight of the next day', () => {
    expect(zonedTimeToDate('2026-09-23', 24, 0, 'Africa/Lagos').toISOString()).toBe('2026-09-23T23:00:00.000Z');
  });
});

describe('toZonedDateString', () => {
  it('reports the date the zone sees, not the UTC date', () => {
    // 23:30 UTC on the 23rd is already 00:30 on the 24th in Lagos.
    const instant = new Date('2026-09-23T23:30:00Z');
    expect(toZonedDateString(instant, 'Africa/Lagos')).toBe('2026-09-24');
    expect(toZonedDateString(instant, 'UTC')).toBe('2026-09-23');
  });

  it('round-trips with zonedTimeToDate across zones and hours', () => {
    for (const zone of ['Africa/Lagos', 'UTC', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
      for (const hour of [0, 8, 23]) {
        const instant = zonedTimeToDate('2026-03-08', hour, 0, zone);
        expect(toZonedDateString(instant, zone)).toBe('2026-03-08');
      }
    }
  });
});

describe('dayBounds', () => {
  it('spans 24 hours in a fixed-offset zone', () => {
    const { start, end } = dayBounds('2026-09-23', 'Africa/Lagos');
    expect(start.toISOString()).toBe('2026-09-22T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-23T23:00:00.000Z');
  });

  it('spans 23 hours on a spring-forward day', () => {
    const { start, end } = dayBounds('2026-03-08', 'America/New_York');
    expect((end - start) / 3600000).toBe(23);
  });
});

describe('date strings', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDaysToDateString('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateString('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('validates real calendar dates only', () => {
    expect(isValidDateString('2026-09-23')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('23-09-2026')).toBe(false);
    expect(isValidDateString('tomorrow')).toBe(false);
  });
});
