import { UlidIdGenerator, SequentialIdGenerator } from './id-generator';
import { ValidationError } from '../errors/domain-errors';
import { FixedClock } from './clock';

describe('AC-M00-03 IdGenerator', () => {
  describe('UlidIdGenerator', () => {
    it('generates IDs with prefix and ULID', () => {
      const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
      const gen = new UlidIdGenerator(clock);
      const id = gen.next('usr');
      expect(id).toMatch(/^usr_[A-Z0-9]{26}$/);
    });

    it('preserves prefix as given', () => {
      const clock = new FixedClock();
      const gen = new UlidIdGenerator(clock);
      expect(gen.next('lead')).toMatch(/^lead_/);
      expect(gen.next('evt')).toMatch(/^evt_/);
      expect(gen.next('org')).toMatch(/^org_/);
    });

    it('rejects prefix not matching /^[a-z]{2,6}$/', () => {
      const clock = new FixedClock();
      const gen = new UlidIdGenerator(clock);
      expect(() => gen.next('u')).toThrow(ValidationError);
      expect(() => gen.next('User')).toThrow(ValidationError);
      expect(() => gen.next('user123')).toThrow(ValidationError);
      expect(() => gen.next('')).toThrow(ValidationError);
    });

    it('produces ULIDs with 26 character (10 time + 16 random)', () => {
      const clock = new FixedClock();
      const gen = new UlidIdGenerator(clock);
      const id = gen.next('mid');
      const ulid = id.substring(4); // Remove 'mid_'
      expect(ulid).toHaveLength(26);
    });

    it('generates ULIDs that sort by creation time across milliseconds', () => {
      const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
      const gen = new UlidIdGenerator(clock, () => 0); // Deterministic random

      const id1 = gen.next('evt');
      clock.advance(1);
      const id2 = gen.next('evt');
      clock.advance(1);
      const id3 = gen.next('evt');

      // IDs should sort in creation order
      const ids = [id3, id1, id2].sort();
      expect(ids[0]).toBe(id1);
      expect(ids[1]).toBe(id2);
      expect(ids[2]).toBe(id3);
    });

    it('uses provided random function for determinism in tests', () => {
      const clock = new FixedClock();
      const mockRandom = () => 0.5;
      const gen1 = new UlidIdGenerator(clock, mockRandom);
      const gen2 = new UlidIdGenerator(clock, mockRandom);

      const id1 = gen1.next('usr');
      const id2 = gen2.next('usr');

      // With same clock and random, IDs should be identical
      expect(id1).toBe(id2);
    });

    it('produces uppercase Crockford base32 ULIDs', () => {
      const clock = new FixedClock();
      const gen = new UlidIdGenerator(clock);
      const id = gen.next('xy');
      const ulid = id.substring(3); // Remove 'xy_'
      expect(ulid).toMatch(/^[A-Z0-9]+$/);
      // Crockford base32 uses: 0-9, A-V (no I, L, O, U for confusion)
      expect(ulid).toMatch(/^[0-9A-V]+$/);
    });
  });

  describe('SequentialIdGenerator', () => {
    it('generates sequential IDs per prefix', () => {
      const gen = new SequentialIdGenerator();
      expect(gen.next('usr')).toBe('usr_0001');
      expect(gen.next('usr')).toBe('usr_0002');
      expect(gen.next('usr')).toBe('usr_0003');
    });

    it('maintains separate counters per prefix', () => {
      const gen = new SequentialIdGenerator();
      expect(gen.next('usr')).toBe('usr_0001');
      expect(gen.next('evt')).toBe('evt_0001');
      expect(gen.next('usr')).toBe('usr_0002');
      expect(gen.next('evt')).toBe('evt_0002');
    });

    it('pads counter to 4 digits with leading zeros', () => {
      const gen = new SequentialIdGenerator();
      for (let i = 0; i < 9; i++) gen.next('xy');
      expect(gen.next('xy')).toBe('xy_0010');

      for (let i = 0; i < 89; i++) gen.next('xy');
      expect(gen.next('xy')).toBe('xy_0100');
    });

    it('is deterministic across instances when ordered', () => {
      const gen1 = new SequentialIdGenerator();
      const gen2 = new SequentialIdGenerator();

      expect(gen1.next('usr')).toBe(gen2.next('usr'));
      expect(gen1.next('usr')).toBe(gen2.next('usr'));
    });

    it('handles multiple prefixes concurrently', () => {
      const gen = new SequentialIdGenerator();
      const ids = [
        gen.next('a'),
        gen.next('b'),
        gen.next('a'),
        gen.next('c'),
        gen.next('b'),
        gen.next('a'),
      ];
      expect(ids).toEqual(['a_0001', 'b_0001', 'a_0002', 'c_0001', 'b_0002', 'a_0003']);
    });
  });
});
