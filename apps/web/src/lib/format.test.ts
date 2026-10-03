import { describe, it, expect } from 'vitest';
import { formatMoney, formatDate } from './format';

describe('formatMoney', () => {
  it('formats positive paise to INR with rupee symbol', () => {
    expect(formatMoney(12345678)).toContain('₹');
    expect(formatMoney(12345678)).toContain('1,23,456.78');
  });

  it('formats negative paise', () => {
    const result = formatMoney(-1000);
    expect(result).toContain('-');
    expect(result).toContain('10');
  });

  it('formats zero', () => {
    expect(formatMoney(0)).toContain('0');
  });
});

describe('formatDate', () => {
  it('formats date in en-IN', () => {
    const date = new Date('2026-01-15');
    const result = formatDate(date, 'en');
    expect(result).toMatch(/Jan|January|15|2026/);
  });

  it('formats date in hi-IN', () => {
    const date = new Date('2026-01-15');
    const result = formatDate(date, 'hi');
    expect(result).toBeTruthy();
  });

  it('defaults to en', () => {
    const date = new Date('2026-01-15');
    const result = formatDate(date);
    expect(result).toBeTruthy();
  });
});
