import { EmailAddress } from './email-address';
import { ValidationError } from '../errors/domain-errors';

describe('AC-M00-02 EmailAddress', () => {
  describe('parse', () => {
    it('parses valid email', () => {
      const e = EmailAddress.parse('user@example.com');
      expect(e.value).toBe('user@example.com');
    });

    it('lowercases email', () => {
      const e = EmailAddress.parse('User@EXAMPLE.COM');
      expect(e.value).toBe('user@example.com');
    });

    it('trims whitespace', () => {
      const e = EmailAddress.parse('  user@example.com  ');
      expect(e.value).toBe('user@example.com');
    });

    it('rejects email without @', () => {
      expect(() => EmailAddress.parse('userexample.com')).toThrow(ValidationError);
    });

    it('rejects email without domain', () => {
      expect(() => EmailAddress.parse('user@')).toThrow(ValidationError);
    });

    it('rejects email without TLD', () => {
      expect(() => EmailAddress.parse('user@example')).toThrow(ValidationError);
    });

    it('rejects email with multiple @ symbols', () => {
      expect(() => EmailAddress.parse('user@@example.com')).toThrow(ValidationError);
    });

    it('rejects email with spaces', () => {
      expect(() => EmailAddress.parse('user @example.com')).toThrow(ValidationError);
      expect(() => EmailAddress.parse('user@exam ple.com')).toThrow(ValidationError);
    });

    it('accepts email with dots in local part', () => {
      const e = EmailAddress.parse('first.last@example.com');
      expect(e.value).toBe('first.last@example.com');
    });

    it('accepts email with multiple dots in domain', () => {
      const e = EmailAddress.parse('user@mail.example.co.uk');
      expect(e.value).toBe('user@mail.example.co.uk');
    });

    it('accepts email with hyphen in domain', () => {
      const e = EmailAddress.parse('user@my-example.com');
      expect(e.value).toBe('user@my-example.com');
    });

    it('rejects email with minimum TLD length (must be >= 2)', () => {
      expect(() => EmailAddress.parse('user@example.c')).toThrow(ValidationError);
    });

    it('accepts email with 2-character TLD', () => {
      const e = EmailAddress.parse('user@example.co');
      expect(e.value).toBe('user@example.co');
    });

    it('rejects empty local part', () => {
      expect(() => EmailAddress.parse('@example.com')).toThrow(ValidationError);
    });

    it('rejects email with only spaces', () => {
      expect(() => EmailAddress.parse('   ')).toThrow(ValidationError);
    });
  });

  describe('value', () => {
    it('returns normalized email', () => {
      const e = EmailAddress.parse('Test@Example.COM');
      expect(e.value).toBe('test@example.com');
    });
  });

  describe('masked', () => {
    it('masks email with first char + *** before @', () => {
      const e = EmailAddress.parse('user@example.com');
      expect(e.masked()).toBe('u***@example.com');
    });

    it('preserves domain after @', () => {
      const e = EmailAddress.parse('john.doe@company.co.uk');
      expect(e.masked()).toBe('j***@company.co.uk');
    });

    it('masks single character local part', () => {
      const e = EmailAddress.parse('a@example.com');
      expect(e.masked()).toBe('a***@example.com');
    });

    it('masks long local part', () => {
      const e = EmailAddress.parse('verylongemailaddress@example.com');
      expect(e.masked()).toBe('v***@example.com');
    });

    it('works with numeric local part', () => {
      const e = EmailAddress.parse('123@example.com');
      expect(e.masked()).toBe('1***@example.com');
    });
  });

  describe('equals', () => {
    it('returns true for same email', () => {
      const e1 = EmailAddress.parse('user@example.com');
      const e2 = EmailAddress.parse('user@example.com');
      expect(e1.equals(e2)).toBe(true);
    });

    it('returns true for same email in different cases', () => {
      const e1 = EmailAddress.parse('User@Example.COM');
      const e2 = EmailAddress.parse('user@example.com');
      expect(e1.equals(e2)).toBe(true);
    });

    it('returns false for different emails', () => {
      const e1 = EmailAddress.parse('user1@example.com');
      const e2 = EmailAddress.parse('user2@example.com');
      expect(e1.equals(e2)).toBe(false);
    });

    it('returns false for same local part, different domain', () => {
      const e1 = EmailAddress.parse('user@example.com');
      const e2 = EmailAddress.parse('user@other.com');
      expect(e1.equals(e2)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles plus addressing', () => {
      // Spec pattern allows + in local part
      const e = EmailAddress.parse('user+tag@example.com');
      expect(e.value).toBe('user+tag@example.com');
    });

    it('handles underscore in local part', () => {
      const e = EmailAddress.parse('user_name@example.com');
      expect(e.value).toBe('user_name@example.com');
    });
  });
});
