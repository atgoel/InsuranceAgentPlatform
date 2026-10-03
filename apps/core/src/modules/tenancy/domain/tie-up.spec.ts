import { TieUpSet, TieUpLimitPolicy, TieUp } from './tie-up';
import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M01-03: Tie-up limits come from data: an IMF can hold 6 active insurers per line and the 7th is rejected;
 * individual agent limited to 1 per line; broker unlimited; limits are per date so ended tie-ups don't count;
 * overlapping periods and invalid date ranges are rejected.
 */
describe('AC-M01-03 TieUp limits and validation', () => {
  describe('TieUpLimitPolicy', () => {
    it('creates policy with IMF limit of 6 per line by default', () => {
      const policy = TieUpLimitPolicy.default();
      expect(policy.maxFor('IMF', 'LIFE')).toBe(6);
      expect(policy.maxFor('IMF', 'HEALTH')).toBe(6);
      expect(policy.maxFor('IMF', 'GENERAL')).toBe(6);
    });

    it('creates policy with INDIVIDUAL_AGENT limit of 1 per line by default', () => {
      const policy = TieUpLimitPolicy.default();
      expect(policy.maxFor('INDIVIDUAL_AGENT', 'LIFE')).toBe(1);
      expect(policy.maxFor('INDIVIDUAL_AGENT', 'HEALTH')).toBe(1);
      expect(policy.maxFor('INDIVIDUAL_AGENT', 'GENERAL')).toBe(1);
    });

    it('creates policy with CORPORATE_AGENT limit of 9 per line by default', () => {
      const policy = TieUpLimitPolicy.default();
      expect(policy.maxFor('CORPORATE_AGENT', 'LIFE')).toBe(9);
    });

    it('creates policy with BROKER unlimited (null) by default', () => {
      const policy = TieUpLimitPolicy.default();
      expect(policy.maxFor('BROKER', 'LIFE')).toBeNull();
      expect(policy.maxFor('BROKER', 'HEALTH')).toBeNull();
      expect(policy.maxFor('BROKER', 'GENERAL')).toBeNull();
    });

    it('denies by default (missing row returns 0)', () => {
      const policy = new TieUpLimitPolicy([]);
      expect(policy.maxFor('BROKER', 'LIFE')).toBe(0);
    });
  });

  describe('TieUpSet validation', () => {
    it('rejects invalid date range (effectiveTo < effectiveFrom)', () => {
      const set = new TieUpSet([
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-06-01',
          effectiveTo: '2026-01-01',
        },
      ]);

      const policy = TieUpLimitPolicy.default();
      expect(() => set.validate('IMF', policy)).toThrow(ValidationError);
    });

    it('rejects overlapping periods for same insurer and line', () => {
      const set = new TieUpSet([
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-06-30',
        },
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-05-01',
          effectiveTo: '2026-12-31',
        },
      ]);

      const policy = TieUpLimitPolicy.default();
      expect(() => set.validate('IMF', policy)).toThrow(ValidationError);
    });

    it('allows non-overlapping periods for same insurer+line', () => {
      const set = new TieUpSet([
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-03-31',
        },
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-04-01',
          effectiveTo: '2026-06-30',
        },
      ]);

      const policy = TieUpLimitPolicy.default();
      expect(() => set.validate('IMF', policy)).not.toThrow();
    });

    it('allows same insurer in different lines', () => {
      const set = new TieUpSet([
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
        {
          insurerId: 'ins_001',
          line: 'HEALTH',
          effectiveFrom: '2026-01-01',
        },
      ]);

      const policy = TieUpLimitPolicy.default();
      expect(() => set.validate('IMF', policy)).not.toThrow();
    });

    it('rejects IMF with 7 active insurers in a line on any date', () => {
      const tieUps = Array.from({ length: 7 }, (_, i) => ({
        insurerId: `ins_${i.toString().padStart(3, '0')}`,
        line: 'LIFE' as const,
        effectiveFrom: '2026-01-01',
      }));

      const set = new TieUpSet(tieUps);
      const policy = TieUpLimitPolicy.default();

      expect(() => set.validate('IMF', policy)).toThrow(BusinessRuleError);
    });

    it('allows IMF with exactly 6 active insurers in a line', () => {
      const tieUps = Array.from({ length: 6 }, (_, i) => ({
        insurerId: `ins_${i.toString().padStart(3, '0')}`,
        line: 'LIFE' as const,
        effectiveFrom: '2026-01-01',
      }));

      const set = new TieUpSet(tieUps);
      const policy = TieUpLimitPolicy.default();

      expect(() => set.validate('IMF', policy)).not.toThrow();
    });

    it('does not count ended tie-ups against limit (AC-M01-03 concrete example)', () => {
      const tieUps = [
        // 6 active insurers
        ...Array.from({ length: 6 }, (_, i) => ({
          insurerId: `ins_${i.toString().padStart(3, '0')}`,
          line: 'LIFE' as const,
          effectiveFrom: '2026-01-01',
        })),
        // 7th insurer that ended before the check date
        {
          insurerId: 'ins_007',
          line: 'LIFE' as const,
          effectiveFrom: '2025-01-01',
          effectiveTo: '2025-12-31',
        },
      ];

      const set = new TieUpSet(tieUps);
      const policy = TieUpLimitPolicy.default();

      // Should pass when checking on 2026-01-15 because the 7th is already ended
      expect(() => set.validate('IMF', policy)).not.toThrow();
    });

    it('rejects INDIVIDUAL_AGENT with 2 active insurers in same line', () => {
      const set = new TieUpSet([
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
        {
          insurerId: 'ins_002',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
      ]);

      const policy = TieUpLimitPolicy.default();
      expect(() => set.validate('INDIVIDUAL_AGENT', policy)).toThrow(BusinessRuleError);
    });

    it('allows INDIVIDUAL_AGENT with 1 insurer per line', () => {
      const set = new TieUpSet([
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
        {
          insurerId: 'ins_002',
          line: 'HEALTH',
          effectiveFrom: '2026-01-01',
        },
      ]);

      const policy = TieUpLimitPolicy.default();
      expect(() => set.validate('INDIVIDUAL_AGENT', policy)).not.toThrow();
    });

    it('allows BROKER with unlimited insurers', () => {
      const tieUps = Array.from({ length: 20 }, (_, i) => ({
        insurerId: `ins_${i.toString().padStart(3, '0')}`,
        line: 'LIFE' as const,
        effectiveFrom: '2026-01-01',
      }));

      const set = new TieUpSet(tieUps);
      const policy = TieUpLimitPolicy.default();

      expect(() => set.validate('BROKER', policy)).not.toThrow();
    });

    it('checks limit at every effectiveFrom boundary', () => {
      const set = new TieUpSet([
        // 3 insurers active from 2026-01-01
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
        {
          insurerId: 'ins_002',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
        {
          insurerId: 'ins_003',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
        // 4th starts on 2026-06-01 (should be within limit)
        {
          insurerId: 'ins_004',
          line: 'LIFE',
          effectiveFrom: '2026-06-01',
        },
        // But adding 4th on same date as 1-3 would be fine for IMF
        {
          insurerId: 'ins_005',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
      ]);

      const policy = TieUpLimitPolicy.default();
      expect(() => set.validate('IMF', policy)).not.toThrow();
    });
  });

  describe('TieUpSet activeOn', () => {
    it('returns active tie-ups on a given date', () => {
      const tieUps: TieUp[] = [
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-06-30',
        },
        {
          insurerId: 'ins_002',
          line: 'LIFE',
          effectiveFrom: '2026-07-01',
        },
      ];

      const set = new TieUpSet(tieUps);

      const onJune15 = set.activeOn('2026-06-15', 'LIFE');
      expect(onJune15).toHaveLength(1);
      expect(onJune15[0].insurerId).toBe('ins_001');

      const onJuly15 = set.activeOn('2026-07-15', 'LIFE');
      expect(onJuly15).toHaveLength(1);
      expect(onJuly15[0].insurerId).toBe('ins_002');
    });

    it('returns empty when no tie-ups active on date', () => {
      const tieUps: TieUp[] = [
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-06-01',
          effectiveTo: '2026-06-30',
        },
      ];

      const set = new TieUpSet(tieUps);
      const onJanuary = set.activeOn('2026-01-15', 'LIFE');
      expect(onJanuary).toHaveLength(0);
    });
  });

  describe('TieUpSet insurersFor', () => {
    it('returns list of insurer IDs active on date for line', () => {
      const tieUps: TieUp[] = [
        {
          insurerId: 'ins_001',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
        {
          insurerId: 'ins_002',
          line: 'LIFE',
          effectiveFrom: '2026-01-01',
        },
        {
          insurerId: 'ins_003',
          line: 'HEALTH',
          effectiveFrom: '2026-01-01',
        },
      ];

      const set = new TieUpSet(tieUps);
      const lifeInsurers = set.insurersFor('LIFE', '2026-01-15');

      expect(lifeInsurers).toHaveLength(2);
      expect(lifeInsurers).toContain('ins_001');
      expect(lifeInsurers).toContain('ins_002');
      expect(lifeInsurers).not.toContain('ins_003');
    });
  });
});
