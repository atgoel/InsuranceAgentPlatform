import { FixedClock, SystemClock } from './clock';

describe('Clock', () => {
  describe('FixedClock', () => {
    it('returns same time when not advanced', () => {
      const clock = new FixedClock(new Date('2026-01-01T12:00:00Z'));
      const t1 = clock.now();
      const t2 = clock.now();
      expect(t1.getTime()).toBe(t2.getTime());
    });

    it('defaults to 2026-01-01', () => {
      const clock = new FixedClock();
      expect(clock.now().toISOString()).toContain('2026-01-01');
    });

    it('can be set to new time', () => {
      const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
      clock.set(new Date('2026-02-01T00:00:00Z'));
      expect(clock.now().toISOString()).toContain('2026-02-01');
    });

    it('advances time by milliseconds', () => {
      const clock = new FixedClock(new Date('2026-01-01T12:00:00.000Z'));
      clock.advance(1000);
      expect(clock.now().toISOString()).toContain('12:00:01');
    });

    it('returns new Date instance each call', () => {
      const clock = new FixedClock();
      const d1 = clock.now();
      const d2 = clock.now();
      expect(d1).not.toBe(d2);
      expect(d1.getTime()).toBe(d2.getTime());
    });
  });

  describe('SystemClock', () => {
    it('returns current time', () => {
      const clock = new SystemClock();
      const before = Date.now();
      const now = clock.now().getTime();
      const after = Date.now();
      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBeLessThanOrEqual(after);
    });
  });
});
