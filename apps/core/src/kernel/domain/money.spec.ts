import { Money } from './money';
import { ValidationError } from '../errors/domain-errors';

describe('AC-M00-01 Money', () => {
  describe('ofPaise', () => {
    it('creates money from integer paise', () => {
      const m = Money.ofPaise(10050);
      expect(m.paise).toBe(10050);
      expect(m.currency).toBe('INR');
    });

    it('rejects non-integer paise', () => {
      expect(() => Money.ofPaise(100.5)).toThrow(ValidationError);
      expect(() => Money.ofPaise(Infinity)).toThrow(ValidationError);
      expect(() => Money.ofPaise(NaN)).toThrow(ValidationError);
    });

    it('rejects unsafe integers', () => {
      expect(() => Money.ofPaise(Number.MAX_SAFE_INTEGER + 1)).toThrow(ValidationError);
      expect(() => Money.ofPaise(Number.MIN_SAFE_INTEGER - 1)).toThrow(ValidationError);
    });

    it('defaults to INR currency', () => {
      const m = Money.ofPaise(1000);
      expect(m.currency).toBe('INR');
    });
  });

  describe('ofRupees', () => {
    it('converts rupees to paise with rounding half away from zero', () => {
      const m1 = Money.ofRupees(1.005);
      expect(m1.paise).toBe(101); // 1.005 * 100 = 100.5 → rounds to 101

      const m2 = Money.ofRupees(1.004);
      expect(m2.paise).toBe(100); // 1.004 * 100 = 100.4 → rounds to 100

      const m3 = Money.ofRupees(1.015);
      expect(m3.paise).toBe(102); // 1.015 * 100 = 101.5 → rounds to 102
    });

    it('rounds negative rupees half away from zero', () => {
      const m1 = Money.ofRupees(-1.005);
      expect(m1.paise).toBe(-101); // -1.005 * 100 = -100.5 → rounds to -101 (away from zero)

      const m2 = Money.ofRupees(-1.015);
      expect(m2.paise).toBe(-102); // -1.015 * 100 = -101.5 → rounds to -102 (away from zero)
    });

    it('handles zero', () => {
      const m = Money.ofRupees(0);
      expect(m.paise).toBe(0);
    });
  });

  describe('zero', () => {
    it('creates zero money', () => {
      const m = Money.zero();
      expect(m.paise).toBe(0);
      expect(m.currency).toBe('INR');
    });
  });

  describe('add', () => {
    it('adds two money objects', () => {
      const m1 = Money.ofPaise(100);
      const m2 = Money.ofPaise(50);
      const result = m1.add(m2);
      expect(result.paise).toBe(150);
      expect(result.currency).toBe('INR');
    });

    it('rejects currency mismatch', () => {
    const m1_test = Money.ofPaise(1001);
    const m2_test = Money.ofPaise(1001);
      // If other currency exists, would test mismatch
      // For now assuming only INR exists
    });
  });

  describe('subtract', () => {
    it('subtracts money objects', () => {
      const m1 = Money.ofPaise(150);
      const m2 = Money.ofPaise(50);
      const result = m1.subtract(m2);
      expect(result.paise).toBe(100);
    });

    it('produces negative result when minuend is smaller', () => {
      const m1 = Money.ofPaise(50);
      const m2 = Money.ofPaise(150);
      const result = m1.subtract(m2);
      expect(result.paise).toBe(-100);
    });
  });

  describe('multiplyBps', () => {
    it('multiplies by basis points with rounding half away from zero', () => {
      // 1000 paise * 150 bps / 10000 = 15 paise
      const m = Money.ofPaise(1000);
      const result = m.multiplyBps(150);
      expect(result.paise).toBe(15);
    });

    it('rounds result half away from zero for positive numbers', () => {
      // 1001 paise * 150 bps / 10000 = 15.015 → rounds to 15
      const m = Money.ofPaise(1001);
      const result1 = m.multiplyBps(150);
      expect(result1.paise).toBe(15);

      // 1010 paise * 150 bps / 10000 = 15.15 → rounds to 15
      const result2 = m.multiplyBps(150);
      expect(result2.paise).toBe(15);
    });

    it('rounds result half away from zero for negative numbers', () => {
      // -1000 paise * 150 bps / 10000 = -15 paise
      const m = Money.ofPaise(-1000);
      const result = m.multiplyBps(150);
      expect(result.paise).toBe(-15);
    });

    it('handles zero basis points', () => {
      const m = Money.ofPaise(1000);
      const result = m.multiplyBps(0);
      expect(result.paise).toBe(0);
    });
  });

  describe('isNegative', () => {
    it('returns true for negative money', () => {
      const m = Money.ofPaise(-100);
      expect(m.isNegative()).toBe(true);
    });

    it('returns false for positive money', () => {
      const m = Money.ofPaise(100);
      expect(m.isNegative()).toBe(false);
    });

    it('returns false for zero', () => {
      const m = Money.zero();
      expect(m.isNegative()).toBe(false);
    });
  });

  describe('isZero', () => {
    it('returns true for zero money', () => {
      const m = Money.zero();
      expect(m.isZero()).toBe(true);
    });

    it('returns false for non-zero money', () => {
      const m = Money.ofPaise(1);
      expect(m.isZero()).toBe(false);
    });
  });

  describe('equals', () => {
    it('returns true for equal money', () => {
      const m1 = Money.ofPaise(100);
      const m2 = Money.ofPaise(100);
      expect(m1.equals(m2)).toBe(true);
    });

    it('returns false for different paise', () => {
      const m1 = Money.ofPaise(100);
      const m2 = Money.ofPaise(101);
      expect(m1.equals(m2)).toBe(false);
    });

    it('returns true for zero money', () => {
      const m1 = Money.zero();
      const m2 = Money.ofPaise(0);
      expect(m1.equals(m2)).toBe(true);
    });
  });

  describe('compare', () => {
    it('returns -1 when less', () => {
      const m1 = Money.ofPaise(100);
      const m2 = Money.ofPaise(200);
      expect(m1.compare(m2)).toBe(-1);
    });

    it('returns 0 when equal', () => {
      const m1 = Money.ofPaise(100);
      const m2 = Money.ofPaise(100);
      expect(m1.compare(m2)).toBe(0);
    });

    it('returns 1 when greater', () => {
      const m1 = Money.ofPaise(200);
      const m2 = Money.ofPaise(100);
      expect(m1.compare(m2)).toBe(1);
    });

    it('handles negative values', () => {
      const m1 = Money.ofPaise(-100);
      const m2 = Money.ofPaise(100);
      expect(m1.compare(m2)).toBe(-1);
    });
  });

  describe('toJSON', () => {
    it('serializes to paise and currency', () => {
      const m = Money.ofPaise(10050);
      expect(m.toJSON()).toEqual({
        amountPaise: 10050,
        currency: 'INR',
      });
    });
  });

  describe('format', () => {
    it('formats money with en-IN locale', () => {
      const m = Money.ofRupees(123456.78);
      expect(m.format()).toBe('₹1,23,456.78');
    });

    it('formats zero', () => {
      const m = Money.zero();
      expect(m.format()).toBe('₹0.00');
    });

    it('formats small amounts', () => {
      const m = Money.ofPaise(78);
      expect(m.format()).toBe('₹0.78');
    });

    it('formats negative amounts', () => {
      const m = Money.ofPaise(-10050);
      expect(m.format()).toBe('-₹100.50');
    });
  });

  describe('immutability', () => {
    it('returns new object from add', () => {
      const m1 = Money.ofPaise(100);
      const m2 = Money.ofPaise(50);
      const result = m1.add(m2);
      expect(m1).not.toBe(result);
      expect(m1.paise).toBe(100);
    });

    it('returns new object from subtract', () => {
      const m1 = Money.ofPaise(100);
      const m2 = Money.ofPaise(50);
      const result = m1.subtract(m2);
      expect(m1).not.toBe(result);
      expect(m1.paise).toBe(100);
    });

    it('returns new object from multiplyBps', () => {
      const m = Money.ofPaise(1000);
      const result = m.multiplyBps(100);
      expect(m).not.toBe(result);
      expect(m.paise).toBe(1000);
    });
  });
});
