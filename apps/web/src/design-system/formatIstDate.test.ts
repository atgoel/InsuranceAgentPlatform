import { describe, it, expect } from 'vitest';
import { formatIstDate } from './formatIstDate';

describe('AC-M00-34 formatIstDate', () => {
  it('formats a date-only value without shifting the day', () => {
    expect(formatIstDate('2026-10-04', 'en')).toBe('4 Oct 2026');
  });

  it('formats a timestamp as the Asia/Kolkata calendar date', () => {
    expect(formatIstDate('2026-10-04T20:00:00Z', 'en')).toBe('5 Oct 2026');
  });

  it('keeps the same IST day for an early-morning UTC timestamp', () => {
    expect(formatIstDate('2026-10-04T00:30:00Z', 'en')).toBe('4 Oct 2026');
  });

  it('never shows a time', () => {
    const text = formatIstDate('2026-10-04T20:00:00Z', 'en');
    expect(text).not.toContain(':');
    expect(text).not.toMatch(/am|pm/i);
  });

  it('formats Hindi with the hi-IN locale', () => {
    const expected = new Intl.DateTimeFormat('hi-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, 9, 4)));
    expect(formatIstDate('2026-10-04', 'hi')).toBe(expected);
    expect(formatIstDate('2026-10-04', 'hi')).not.toBe('4 Oct 2026');
  });

  it('returns invalid input unchanged', () => {
    expect(formatIstDate('not-a-date', 'en')).toBe('not-a-date');
    expect(formatIstDate('', 'en')).toBe('');
  });

  it('returns an impossible calendar date unchanged instead of rolling over', () => {
    expect(formatIstDate('2026-02-31', 'en')).toBe('2026-02-31');
    expect(formatIstDate('2026-13-01', 'en')).toBe('2026-13-01');
  });
});
