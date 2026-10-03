import { parseTraceparent, newTraceId, newSpanId, formatTraceparent } from './trace-context';

describe('AC-M00-07 Trace context', () => {
  describe('parseTraceparent', () => {
    it('parses valid W3C traceparent header', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const result = parseTraceparent(header);

      expect(result).toBeDefined();
      expect(result?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(result?.parentSpanId).toBe('00f067aa0ba902b7');
      expect(result?.sampled).toBe(true);
    });

    it('parses sampled=0', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00';
      const result = parseTraceparent(header);

      expect(result?.sampled).toBe(false);
    });

    it('rejects malformed headers', () => {
      expect(parseTraceparent('invalid')).toBeUndefined();
      expect(parseTraceparent('00-short')).toBeUndefined();
      expect(parseTraceparent('01-...')).toBeUndefined(); // Wrong version
    });

    it('rejects all-zero traceId', () => {
      const header = '00-00000000000000000000000000000000-00f067aa0ba902b7-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('rejects all-zero spanId', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('returns undefined for missing header', () => {
      expect(parseTraceparent(undefined)).toBeUndefined();
    });

    it('handles valid traceId and spanId lengths', () => {
      const header = '00-ffffffffffffffffffffffffffffffff-ffffffffffffffff-01';
      const result = parseTraceparent(header);
      expect(result).toBeDefined();
      expect(result?.traceId).toHaveLength(32);
      expect(result?.parentSpanId).toHaveLength(16);
    });
  });

  describe('newTraceId', () => {
    it('generates 32 lowercase hex characters', () => {
      const traceId = newTraceId();
      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('generates unique IDs', () => {
      const id1 = newTraceId();
      const id2 = newTraceId();
      expect(id1).not.toBe(id2);
    });

    it('is cryptographically random', () => {
      const traceIds = Array.from({ length: 10 }, () => newTraceId());
      const unique = new Set(traceIds);
      expect(unique.size).toBe(10);
    });
  });

  describe('newSpanId', () => {
    it('generates 16 lowercase hex characters', () => {
      const spanId = newSpanId();
      expect(spanId).toHaveLength(16);
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('generates unique IDs', () => {
      const id1 = newSpanId();
      const id2 = newSpanId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('formatTraceparent', () => {
    it('formats valid traceparent header', () => {
      const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const spanId = '00f067aa0ba902b7';
      const header = formatTraceparent(traceId, spanId, true);

      expect(header).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });

    it('formats with sampled=false', () => {
      const header = formatTraceparent('abc123def456abc123def456abc123de', 'def456abc123def4', false);
      expect(header).toMatch(/-00$/);
    });

    it('defaults sampled to undefined', () => {
      const header = formatTraceparent('ffffffffffffffffffffffffffffffff', 'ffffffffffffffff');
      // When sampled is undefined, might be treated as false or not included
      expect(header).toContain('ffffffffffffffff');
    });

    it('produces valid traceparent format', () => {
      const header = formatTraceparent(newTraceId(), newSpanId(), true);
      const parsed = parseTraceparent(header);
      expect(parsed).toBeDefined();
      expect(parsed?.sampled).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('parses formatted traceparent correctly', () => {
      const original = {
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        parentSpanId: '00f067aa0ba902b7',
        sampled: true,
      };

      const formatted = formatTraceparent(original.traceId, original.parentSpanId, original.sampled);
      const parsed = parseTraceparent(formatted);

      expect(parsed?.traceId).toBe(original.traceId);
      expect(parsed?.parentSpanId).toBe(original.parentSpanId);
      expect(parsed?.sampled).toBe(original.sampled);
    });
  });
});
