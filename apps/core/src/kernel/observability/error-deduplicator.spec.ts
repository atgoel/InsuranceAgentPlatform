import { ErrorDeduplicator } from './error-deduplicator';
import { FixedClock } from '../domain/clock';
import { ValidationError, BusinessRuleError } from '../errors/domain-errors';

describe('AC-M00-11 ErrorDeduplicator', () => {
  it('admits first error in window', () => {
    const clock = new FixedClock();
    const dedup = new ErrorDeduplicator(clock);
    const fp = dedup.fingerprint(new Error('test'));
    const result = dedup.admit(fp);
    expect(result.log).toBe(true);
    expect(result.suppressedSinceLast).toBe(0);
  });

  it('suppresses duplicates after max per window', () => {
    const clock = new FixedClock();
    const dedup = new ErrorDeduplicator(clock, { maxPerWindow: 2 });
    const fp = dedup.fingerprint(new Error('test'));

    expect(dedup.admit(fp).log).toBe(true);
    expect(dedup.admit(fp).log).toBe(true);
    expect(dedup.admit(fp).log).toBe(false);
  });

  it('reports suppressedSinceLast on window rollover', () => {
    const clock = new FixedClock();
    const dedup = new ErrorDeduplicator(clock, { windowMs: 1000, maxPerWindow: 1 });
    const fp = dedup.fingerprint(new Error('test'));

    dedup.admit(fp); // First, logged
    dedup.admit(fp); // Second, suppressed
    dedup.admit(fp); // Third, suppressed

    clock.advance(1100); // Advance past window

    const nextAdmit = dedup.admit(fp);
    expect(nextAdmit.log).toBe(true);
    expect(nextAdmit.suppressedSinceLast).toBe(2);
  });

  describe('fingerprint', () => {
    it('generates 12-hex format fingerprint', () => {
      const dedup = new ErrorDeduplicator(new FixedClock());
      const fp = dedup.fingerprint(new Error('test'));
      expect(fp).toMatch(/^[0-9a-f]{12}$/);
    });

    it('same error from same site → same fingerprint', () => {
      const dedup = new ErrorDeduplicator(new FixedClock());
      const error = new Error('Same message');
      const fp1 = dedup.fingerprint(error);
      const fp2 = dedup.fingerprint(error);
      expect(fp1).toBe(fp2);
    });

    it('different error code → different fingerprint', () => {
      const dedup = new ErrorDeduplicator(new FixedClock());
      const e1 = new ValidationError('error_1', 'msg');
      const e2 = new BusinessRuleError('error_2', 'msg');
      expect(dedup.fingerprint(e1)).not.toBe(dedup.fingerprint(e2));
    });

    it('different error type → different fingerprint', () => {
      const dedup = new ErrorDeduplicator(new FixedClock());
      const e1 = new Error('test');
      const e2 = new ValidationError('test', 'test');
      expect(dedup.fingerprint(e1)).not.toBe(dedup.fingerprint(e2));
    });
  });

  describe('window rollover with suppressedSinceLast', () => {
    it('after 7 errors in window 1, first in window 2 returns suppressedSinceLast 2', () => {
      const clock = new FixedClock();
      const dedup = new ErrorDeduplicator(clock, { windowMs: 1000, maxPerWindow: 5 });
      const fp = dedup.fingerprint(new Error('test'));

      // Window 1: admit first 5, suppress 6th and 7th
      for (let i = 0; i < 7; i++) {
        dedup.admit(fp);
      }

      // Move to window 2
      clock.advance(1100);

      // First error in window 2 should report 2 suppressedSinceLast
      const result = dedup.admit(fp);
      expect(result.log).toBe(true);
      expect(result.suppressedSinceLast).toBe(2);
    });
  });
});
