import { UsageMeter } from './usage';
import { ValidationError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M01-06: Usage metering allows consumption within limits, denies beyond limit (429 usage_limit_exceeded)
 * without changing the counter, treats null limits as unlimited and emits tenant.usage.threshold_crossed
 * exactly once per metric per period at the plan's alert threshold.
 */
describe('AC-M01-06 UsageMeter', () => {
  describe('consume', () => {
    it('allows consumption within limit', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 10,
        limit: 25,
      };

      const result = UsageMeter.consume(counter, 5, 75, new Date('2026-01-15'));

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.counter.used).toBe(15);
      }
    });

    it('denies consumption beyond limit without changing counter', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 20,
        limit: 25,
      };

      const result = UsageMeter.consume(counter, 10, 75, new Date('2026-01-15'));

      expect(result.allowed).toBe(false);
      expect(result.counter.used).toBe(20); // unchanged
    });

    it('allows consumption with null limit (unlimited)', () => {
      const counter = {
        metric: 'customers' as const,
        period: '2026-01',
        used: 1000000,
        limit: null,
      };

      const result = UsageMeter.consume(counter, 1000000, 75, new Date('2026-01-15'));

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.counter.used).toBe(2000000);
      }
    });

    it('rejects non-positive amounts', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 10,
        limit: 25,
      };

      expect(() => UsageMeter.consume(counter, 0, 75, new Date())).toThrow(ValidationError);
      expect(() => UsageMeter.consume(counter, -5, 75, new Date())).toThrow(ValidationError);
    });

    it('detects threshold crossing (75% alert threshold)', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 10,
        limit: 20, // 75% = 15
      };

      // Consume from 10 to 16 (crosses 75% threshold of 15)
      const result = UsageMeter.consume(counter, 6, 75, new Date('2026-01-15'));

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.crossedThreshold).toBe(true);
        expect(result.counter.alertedAt).toBeDefined();
      }
    });

    it('emits threshold crossed exactly once per period', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 10,
        limit: 20,
        alertedAt: undefined,
      };

      // First crossing
      const result1 = UsageMeter.consume(counter, 6, 75, new Date('2026-01-15'));

      expect(result1.allowed).toBe(true);
      if (result1.allowed) {
        expect(result1.crossedThreshold).toBe(true);
        const alertedCounter = result1.counter;

        // Second consumption should not cross again
        const result2 = UsageMeter.consume(alertedCounter, 1, 75, new Date('2026-01-16'));
        expect(result2.allowed).toBe(true);
        if (result2.allowed) {
          expect(result2.crossedThreshold).toBe(false);
        }
      }
    });

    it('does not cross threshold if already alerted', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 16,
        limit: 20,
        alertedAt: '2026-01-15T00:00:00Z',
      };

      const result = UsageMeter.consume(counter, 1, 75, new Date('2026-01-16'));

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.crossedThreshold).toBe(false);
      }
    });

    it('crosses threshold at exactly the threshold percentage', () => {
      const counter = {
        metric: 'ai_credits' as const,
        period: '2026-01',
        used: 749, // Just below 75% of 1000
        limit: 1000,
      };

      // Consume 1 more to reach exactly 750 (75%)
      const result = UsageMeter.consume(counter, 1, 75, new Date('2026-01-15'));

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.crossedThreshold).toBe(true);
      }
    });

    it('does not cross if usage stays below threshold', () => {
      const counter = {
        metric: 'ai_credits' as const,
        period: '2026-01',
        used: 700,
        limit: 1000,
      };

      const result = UsageMeter.consume(counter, 40, 75, new Date('2026-01-15'));

      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.crossedThreshold).toBe(false);
      }
    });
  });

  describe('percentUsed', () => {
    it('calculates percentage used', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 15,
        limit: 25,
      };

      const percent = UsageMeter.percentUsed(counter);
      expect(percent).toBe(60);
    });

    it('returns null for unlimited metrics', () => {
      const counter = {
        metric: 'customers' as const,
        period: '2026-01',
        used: 1000000,
        limit: null,
      };

      const percent = UsageMeter.percentUsed(counter);
      expect(percent).toBeNull();
    });

    it('rounds percentage to integer', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 1,
        limit: 3,
      };

      const percent = UsageMeter.percentUsed(counter);
      expect(percent).toBe(33); // 33.333... rounded
    });

    it('handles zero usage', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 0,
        limit: 25,
      };

      const percent = UsageMeter.percentUsed(counter);
      expect(percent).toBe(0);
    });

    it('handles full usage', () => {
      const counter = {
        metric: 'seats' as const,
        period: '2026-01',
        used: 25,
        limit: 25,
      };

      const percent = UsageMeter.percentUsed(counter);
      expect(percent).toBe(100);
    });
  });
});
