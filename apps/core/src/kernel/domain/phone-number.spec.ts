import { PhoneNumber } from './phone-number';
import { ValidationError } from '../errors/domain-errors';

describe('AC-M00-02 PhoneNumber', () => {
  describe('parse', () => {
    it('parses 10-digit number with Indian formatting', () => {
      const p = PhoneNumber.parse('9876543210');
      expect(p.e164).toBe('+919876543210');
    });

    it('parses number with leading 91', () => {
      const p = PhoneNumber.parse('919876543210');
      expect(p.e164).toBe('+919876543210');
    });

    it('parses number with leading 0 (India)', () => {
      const p = PhoneNumber.parse('09876543210');
      expect(p.e164).toBe('+919876543210');
    });

    it('parses number with +91 prefix', () => {
      const p = PhoneNumber.parse('+919876543210');
      expect(p.e164).toBe('+919876543210');
    });

    it('strips spaces and dashes', () => {
      const p1 = PhoneNumber.parse('+91 9876-543-210');
      expect(p1.e164).toBe('+919876543210');

      const p2 = PhoneNumber.parse('98765 43210');
      expect(p2.e164).toBe('+919876543210');
    });

    it('strips parentheses', () => {
      const p = PhoneNumber.parse('(98)76543210');
      expect(p.e164).toBe('+919876543210');
    });

    it('rejects number not starting 6-9', () => {
      expect(() => PhoneNumber.parse('5876543210')).toThrow(ValidationError);
      expect(() => PhoneNumber.parse('3876543210')).toThrow(ValidationError);
    });

    it('rejects number with wrong length after normalization', () => {
      expect(() => PhoneNumber.parse('987654321')).toThrow(ValidationError); // 9 digits
      expect(() => PhoneNumber.parse('98765432100')).toThrow(ValidationError); // 11 digits
    });

    it('accepts all starting digits 6-9', () => {
      expect(() => PhoneNumber.parse('6876543210')).not.toThrow();
      expect(() => PhoneNumber.parse('7876543210')).not.toThrow();
      expect(() => PhoneNumber.parse('8876543210')).not.toThrow();
      expect(() => PhoneNumber.parse('9876543210')).not.toThrow();
    });

    it('handles 12-digit number with 91 prefix', () => {
      const p = PhoneNumber.parse('919876543210');
      expect(p.e164).toBe('+919876543210');
    });

    it('rejects letters or special characters', () => {
      expect(() => PhoneNumber.parse('987654321a')).toThrow(ValidationError);
      expect(() => PhoneNumber.parse('98765@3210')).toThrow(ValidationError);
    });
  });

  describe('e164', () => {
    it('returns E.164 format', () => {
      const p = PhoneNumber.parse('9876543210');
      expect(p.e164).toBe('+919876543210');
    });
  });

  describe('masked', () => {
    it('shows only last 4 digits with country code', () => {
      const p = PhoneNumber.parse('9876543210');
      expect(p.masked()).toBe('+91******3210');
    });

    it('masks all middle digits', () => {
      const p = PhoneNumber.parse('6123456789');
      const masked = p.masked();
      expect(masked).toBe('+91******6789');
      expect(masked).not.toContain('1234');
      expect(masked).not.toContain('5678');
    });
  });

  describe('equals', () => {
    it('returns true for same number', () => {
      const p1 = PhoneNumber.parse('9876543210');
      const p2 = PhoneNumber.parse('9876543210');
      expect(p1.equals(p2)).toBe(true);
    });

    it('returns true for same number in different formats', () => {
      const p1 = PhoneNumber.parse('9876543210');
      const p2 = PhoneNumber.parse('+919876543210');
      const p3 = PhoneNumber.parse('919876543210');
      expect(p1.equals(p2)).toBe(true);
      expect(p2.equals(p3)).toBe(true);
    });

    it('returns false for different numbers', () => {
      const p1 = PhoneNumber.parse('9876543210');
      const p2 = PhoneNumber.parse('9876543211');
      expect(p1.equals(p2)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles all spaces variant', () => {
      const p = PhoneNumber.parse('9876 543 210');
      expect(p.e164).toBe('+919876543210');
    });

    it('handles mixed formatting', () => {
      const p = PhoneNumber.parse('+91-98765-43210');
      expect(p.e164).toBe('+919876543210');
    });
  });
});
