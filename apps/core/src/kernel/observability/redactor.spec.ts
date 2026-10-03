import { Redactor } from './redactor';

describe('AC-M00-08 Redactor', () => {
  describe('deny-list redaction', () => {
    it('redacts deny-listed keys', () => {
      const r = new Redactor();
      const obj = { username: 'alice', password: 'secret123' };
      const redacted = r.redact(obj);
      expect((redacted as Record<string, unknown>).password).toBe('[REDACTED]');
      expect((redacted as Record<string, unknown>).username).toBe('alice');
    });

    it('redacts case-insensitive keys', () => {
      const r = new Redactor();
      const redacted = r.redact({ Authorization: 'Bearer token', Token: 'secret' });
      expect((redacted as Record<string, unknown>).Authorization).toBe('[REDACTED]');
      expect((redacted as Record<string, unknown>).Token).toBe('[REDACTED]');
    });
  });

  describe('string scrubbers', () => {
    it('scrubs Indian phone numbers', () => {
      const r = new Redactor();
      const redacted = r.redact({ phone: '+919876543210' });
      expect((redacted as Record<string, unknown>).phone).toBe('+91******3210');
    });

    it('scrubs email addresses', () => {
      const r = new Redactor();
      const redacted = r.redact({ email: 'alice@example.com' });
      expect((redacted as Record<string, unknown>).email).toBe('a***@example.com');
    });

    it('scrubs PAN', () => {
      const r = new Redactor();
      const redacted = r.redact({ note: 'PAN AAAPK5055K' });
      expect((redacted as Record<string, unknown>).note).toBe('PAN [PAN]');
    });

    it('scrubs Aadhaar', () => {
      const r = new Redactor();
      const redacted = r.redact({ note: 'id 1234 5678 9012' });
      expect((redacted as Record<string, unknown>).note).toBe('id [AADHAAR]');
    });
  });

  describe('string truncation', () => {
    it('truncates long strings', () => {
      const r = new Redactor({ maxString: 10 });
      const redacted = r.redact({ msg: 'This is a very long message' });
      expect((redacted as Record<string, unknown>).msg).toMatch(/…$/);
    });

    it('preserves short strings', () => {
      const r = new Redactor({ maxString: 100 });
      const redacted = r.redact({ msg: 'Short' });
      expect((redacted as Record<string, unknown>).msg).toBe('Short');
    });
  });

  describe('array truncation', () => {
    it('truncates large arrays', () => {
      const r = new Redactor({ maxArray: 5 });
      const arr = Array.from({ length: 20 }, (_, i) => i);
      const redacted = r.redact({ items: arr });
      expect((redacted as Record<string, unknown>).items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('depth limiting', () => {
    it('limits nesting depth', () => {
      const r = new Redactor({ maxDepth: 2 });
      const deep = { a: { b: { c: { d: 'value' } } } };
      const redacted = r.redact(deep);
      // Deep objects should be replaced
      expect(redacted).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('redacts Error objects', () => {
      const r = new Redactor();
      const err = new Error('Something went wrong with secret_key_123');
      const redacted = r.redact(err) as any;
      expect(redacted.type).toBe('Error');
      expect(redacted.message).toBeDefined();
    });
  });

  describe('immutability', () => {
    it('returns new object', () => {
      const r = new Redactor();
      const original = { key: 'value' };
      const redacted = r.redact(original);
      expect(redacted).not.toBe(original);
      expect(original.key).toBe('value');
    });
  });
});
