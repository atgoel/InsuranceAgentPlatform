import { cursorOffset, encodeCursor, decodeCursor, PageQuerySchema } from './pagination';
import { ValidationError } from '../errors/domain-errors';

describe('AC-M00-26 Pagination', () => {
  it('encodes cursor', () => {
    const cursor = encodeCursor({ id: 'lead_123', ts: 1000 });
    expect(typeof cursor).toBe('string');
  });

  it('decodes cursor', () => {
    const orig = { id: 'lead_123', ts: 1000 };
    const cursor = encodeCursor(orig);
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual(orig);
  });

  it('rejects invalid cursor', () => {
    expect(() => decodeCursor('invalid-base64!!!')).toThrow(ValidationError);
  });

  describe('PageQuerySchema', () => {
    it('validates limit 1-100', () => {
      const result = PageQuerySchema.safeParse({ limit: 50 });
      expect(result.success).toBe(true);
    });

    it('rejects limit < 1', () => {
      const result = PageQuerySchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects limit > 100', () => {
      const result = PageQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('defaults limit to 25', () => {
      const result = PageQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts optional cursor', () => {
      const result = PageQuerySchema.safeParse({ limit: 10, cursor: 'abc123' });
      expect(result.success).toBe(true);
    });
  });
});

describe('AC-M00-26 cursorOffset', () => {
  const forge = (value: unknown) => Buffer.from(JSON.stringify({ offset: value })).toString('base64url');
  it('reads the offset from a valid cursor and 0 without one', () => {
    expect(cursorOffset(undefined)).toBe(0);
    expect(cursorOffset(encodeCursor({ offset: 50 }))).toBe(50);
  });
  it.each([['abc'], [-1], [1.5], ['10; drop table x'], [Number.MAX_SAFE_INTEGER + 2]])('rejects a forged offset %p as invalid_cursor', (value) => {
    expect(() => cursorOffset(forge(value))).toThrow(expect.objectContaining({ code: 'invalid_cursor' }));
  });
});
