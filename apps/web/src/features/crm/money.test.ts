import { describe, it, expect } from 'vitest';
import { formatPaise } from './money';

describe('AC-M04-27 pipeline money', () => {
  it('AC-M04-27 formats whole rupees in en-IN grouping', () => {
    expect(formatPaise(12345600)).toBe('₹1,23,456');
    expect(formatPaise(0)).toBe('₹0');
  });

  it('AC-M04-27 keeps paise exact without float rounding', () => {
    expect(formatPaise(12345678)).toBe('₹1,23,456.78');
    expect(formatPaise(100005)).toBe('₹1,000.05');
  });
});
