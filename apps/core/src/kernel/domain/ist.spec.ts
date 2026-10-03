import { addDays, daysBetween, istAt, istDate, istDayStart } from './ist';

describe('IST calendar helpers (independent of the server timezone)', () => {
  it('maps instants to IST calendar dates across the UTC midnight boundary', () => {
    expect(istDate(new Date('2026-10-03T18:29:59.999Z'))).toBe('2026-10-03');
    expect(istDate(new Date('2026-10-03T18:30:00.000Z'))).toBe('2026-10-04');
  });

  it('builds IST wall-clock instants and day starts', () => {
    expect(istAt('2026-10-04', 10, 0).toISOString()).toBe('2026-10-04T04:30:00.000Z');
    expect(istDayStart(new Date('2026-10-03T20:00:00.000Z')).toISOString()).toBe('2026-10-03T18:30:00.000Z');
  });

  it('adds and counts calendar days, including month and leap boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-10-03', '2026-12-02')).toBe(60);
    expect(daysBetween('2026-10-03', '2026-10-01')).toBe(-2);
  });
});
