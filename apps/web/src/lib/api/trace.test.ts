import { describe, it, expect } from 'vitest';
import { newTraceId, newSpanId, formatTraceparent, parseTraceparent } from './trace';

describe('AC-M00-27 Trace utilities', () => {
  describe('newTraceId', () => {
    it('generates 32 character hex string', () => {
      const traceId = newTraceId();
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('generates different IDs on each call', () => {
      const id1 = newTraceId();
      const id2 = newTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('newSpanId', () => {
    it('generates 16 character hex string', () => {
      const spanId = newSpanId();
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('generates different IDs on each call', () => {
      const id1 = newSpanId();
      const id2 = newSpanId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('formatTraceparent', () => {
    it('formats valid traceparent header with sampled flag', () => {
      const traceId = 'a'.repeat(32);
      const spanId = 'b'.repeat(16);
      const result = formatTraceparent(traceId, spanId, true);
      expect(result).toBe(`00-${traceId}-${spanId}-01`);
    });

    it('formats valid traceparent header without sampled flag', () => {
      const traceId = 'c'.repeat(32);
      const spanId = 'd'.repeat(16);
      const result = formatTraceparent(traceId, spanId, false);
      expect(result).toBe(`00-${traceId}-${spanId}-00`);
    });

    it('defaults to sampled=true', () => {
      const traceId = 'e'.repeat(32);
      const spanId = 'f'.repeat(16);
      const result = formatTraceparent(traceId, spanId);
      expect(result).toBe(`00-${traceId}-${spanId}-01`);
    });

    it('includes version 00', () => {
      const result = formatTraceparent('a'.repeat(32), 'b'.repeat(16));
      expect(result.startsWith('00-')).toBe(true);
    });
  });

  describe('parseTraceparent', () => {
    it('parses valid sampled traceparent', () => {
      const header = '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-01';
      const result = parseTraceparent(header);
      expect(result).toEqual({
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        sampled: true,
      });
    });

    it('parses valid unsampled traceparent', () => {
      const header = '00-' + 'c'.repeat(32) + '-' + 'd'.repeat(16) + '-00';
      const result = parseTraceparent(header);
      expect(result).toEqual({
        traceId: 'c'.repeat(32),
        spanId: 'd'.repeat(16),
        sampled: false,
      });
    });

    it('returns undefined for undefined header', () => {
      expect(parseTraceparent(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(parseTraceparent('')).toBeUndefined();
    });

    it('returns undefined for invalid number of parts', () => {
      expect(parseTraceparent('00-abc')).toBeUndefined();
      expect(parseTraceparent('00-abc-def-01-extra')).toBeUndefined();
    });

    it('returns undefined for invalid version', () => {
      const header = '01-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('returns undefined for invalid traceId length', () => {
      const header = '00-' + 'a'.repeat(31) + '-' + 'b'.repeat(16) + '-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('returns undefined for invalid spanId length', () => {
      const header = '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(15) + '-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('returns undefined for invalid flags length', () => {
      const header = '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-1';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('returns undefined for all-zero traceId', () => {
      const header = '00-' + '0'.repeat(32) + '-' + 'b'.repeat(16) + '-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('returns undefined for all-zero spanId', () => {
      const header = '00-' + 'a'.repeat(32) + '-' + '0'.repeat(16) + '-01';
      expect(parseTraceparent(header)).toBeUndefined();
    });

    it('parses traceparent with mixed hex characters', () => {
      const header = '00-1234567890abcdef1234567890abcdef-0123456789abcdef-01';
      const result = parseTraceparent(header);
      expect(result).toBeDefined();
      expect(result?.traceId).toBe('1234567890abcdef1234567890abcdef');
      expect(result?.spanId).toBe('0123456789abcdef');
      expect(result?.sampled).toBe(true);
    });
  });

  describe('roundtrip', () => {
    it('formats and parses consistently', () => {
      const traceId = newTraceId();
      const spanId = newSpanId();
      const formatted = formatTraceparent(traceId, spanId, true);
      const parsed = parseTraceparent(formatted);

      expect(parsed?.traceId).toBe(traceId);
      expect(parsed?.spanId).toBe(spanId);
      expect(parsed?.sampled).toBe(true);
    });

    it('roundtrip preserves unsampled flag', () => {
      const traceId = newTraceId();
      const spanId = newSpanId();
      const formatted = formatTraceparent(traceId, spanId, false);
      const parsed = parseTraceparent(formatted);

      expect(parsed?.sampled).toBe(false);
    });
  });
});
