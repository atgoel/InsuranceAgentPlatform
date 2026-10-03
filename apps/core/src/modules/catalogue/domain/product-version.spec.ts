import { describe, it, expect } from '@jest/globals';
import { ProductVersion, type ProductVersionProps } from './product-version';
import { BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M05-01: ProductVersion lifecycle draft→active→withdrawn; locked versions reject edits
 * with `product_version_locked`; `isEffective` honours dates and status.
 */
describe('AC-M05-01 ProductVersion', () => {
  const today = '2026-10-03';

  /**
   * ProductVersion.draft validation (UIN /^[A-Z0-9]{6,30}$/, channels non-empty)
   */
  describe('ProductVersion.draft', () => {
    it('creates a draft version with valid properties', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'EXAMPLEUIN001',
        wordingVersion: 'v1.0',
        wordingUrl: 'https://example.com/wording',
        posEligible: true,
        channels: ['IMF', 'BROKER'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2027-10-01',
        quoteRequirements: ['dob', 'occupation'],
        keyFacts: [{ label: 'Premium', value: '5000' }],
      };

      const version = ProductVersion.draft(props);

      expect(version.id).toBe('pv_1');
      expect(version.uin).toBe('EXAMPLEUIN001');
      expect(version.channels).toEqual(['IMF', 'BROKER']);
      expect(version.status).toBe('draft');
      expect(version.lockedAt).toBeUndefined();
    });

    it('rejects UIN shorter than 6 characters', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC12',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      expect(() => ProductVersion.draft(props)).toThrow(ValidationError);
    });

    it('rejects UIN longer than 30 characters', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ12345',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      expect(() => ProductVersion.draft(props)).toThrow(ValidationError);
    });

    it('rejects UIN with lowercase letters', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'abc12345',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      expect(() => ProductVersion.draft(props)).toThrow(ValidationError);
    });

    it('rejects UIN with special characters', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC-12345',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      expect(() => ProductVersion.draft(props)).toThrow(ValidationError);
    });

    it('accepts UIN with exactly 6 characters', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      const version = ProductVersion.draft(props);
      expect(version.uin).toBe('ABC123');
    });

    it('accepts UIN with exactly 30 characters', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      const version = ProductVersion.draft(props);
      expect(version.uin).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ1234');
    });

    it('rejects empty channels array', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: [],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      expect(() => ProductVersion.draft(props)).toThrow(ValidationError);
    });

    it('accepts single channel', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      const version = ProductVersion.draft(props);
      expect(version.channels).toEqual(['IMF']);
    });

    it('accepts multiple channels', () => {
      const props: Omit<ProductVersionProps, 'status' | 'lockedAt'> = {
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF', 'BROKER', 'INDIVIDUAL_AGENT'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      };

      const version = ProductVersion.draft(props);
      expect(version.channels).toEqual(['IMF', 'BROKER', 'INDIVIDUAL_AGENT']);
    });
  });

  /**
   * activate() transitions draft → active
   */
  describe('activate', () => {
    it('transitions a draft version to active status', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        quoteRequirements: [],
        keyFacts: [],
      });

      expect(version.status).toBe('draft');
      version.activate();
      expect(version.status).toBe('active');
    });

    it('is idempotent on active version', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();
      version.activate();
      expect(version.status).toBe('active');
    });
  });

  /**
   * withdraw() transitions active → withdrawn with effectiveTo
   */
  describe('withdraw', () => {
    it('transitions an active version to withdrawn and sets effectiveTo', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();
      version.withdraw('2026-10-15');

      expect(version.status).toBe('withdrawn');
      expect(version.effectiveTo).toBe('2026-10-15');
    });

    it('is idempotent on withdrawn version', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();
      version.withdraw('2026-10-15');
      version.withdraw('2026-10-20');

      expect(version.status).toBe('withdrawn');
      expect(version.effectiveTo).toBe('2026-10-20');
    });
  });

  /**
   * lock() marks version as locked; idempotent
   */
  describe('lock', () => {
    it('locks a draft version with lockedAt timestamp', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        quoteRequirements: [],
        keyFacts: [],
      });

      const lockTime = new Date('2026-10-03T10:00:00Z');
      version.lock(lockTime);

      expect(version.lockedAt).toBe(lockTime.toISOString());
    });

    it('locks an active version', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();
      const lockTime = new Date('2026-10-03T10:00:00Z');
      version.lock(lockTime);

      expect(version.lockedAt).toBe(lockTime.toISOString());
    });

    it('is idempotent when locking an already locked version', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        quoteRequirements: [],
        keyFacts: [],
      });

      const lockTime1 = new Date('2026-10-03T10:00:00Z');
      const lockTime2 = new Date('2026-10-03T11:00:00Z');

      version.lock(lockTime1);
      const firstLockTime = version.lockedAt;

      version.lock(lockTime2);
      expect(version.lockedAt).toBe(firstLockTime);
    });
  });

  /**
   * edit() allows changes to specific fields when unlocked,
   * but raises BusinessRuleError('product_version_locked') when locked
   */
  describe('edit', () => {
    it('allows editing keyFacts when unlocked', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        keyFacts: [{ label: 'Premium', value: '5000' }],
        quoteRequirements: [],
      });

      version.edit({
        keyFacts: [{ label: 'Premium', value: '6000' }],
      });

      expect(version.keyFacts).toEqual([{ label: 'Premium', value: '6000' }]);
    });

    it('allows editing quoteRequirements when unlocked', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        keyFacts: [],
        quoteRequirements: ['dob'],
      });

      version.edit({
        quoteRequirements: ['dob', 'occupation'],
      });

      expect(version.quoteRequirements).toEqual(['dob', 'occupation']);
    });

    it('allows editing wordingUrl when unlocked', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        wordingUrl: 'https://old.com/wording',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        keyFacts: [],
        quoteRequirements: [],
      });

      version.edit({
        wordingUrl: 'https://new.com/wording',
      });

      expect(version.wordingUrl).toBe('https://new.com/wording');
    });

    it('allows editing channels when unlocked', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        keyFacts: [],
        quoteRequirements: [],
      });

      version.edit({
        channels: ['IMF', 'BROKER'],
      });

      expect(version.channels).toEqual(['IMF', 'BROKER']);
    });

    it('allows editing posEligible when unlocked', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: false,
        channels: ['IMF'],
        effectiveFrom: today,
        keyFacts: [],
        quoteRequirements: [],
      });

      version.edit({
        posEligible: true,
      });

      expect(version.posEligible).toBe(true);
    });

    it('allows multiple fields to be edited together', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: false,
        channels: ['IMF'],
        effectiveFrom: today,
        keyFacts: [{ label: 'Old', value: 'value' }],
        quoteRequirements: [],
      });

      version.edit({
        keyFacts: [{ label: 'New', value: 'value' }],
        posEligible: true,
        channels: ['IMF', 'BROKER'],
      });

      expect(version.keyFacts).toEqual([{ label: 'New', value: 'value' }]);
      expect(version.posEligible).toBe(true);
      expect(version.channels).toEqual(['IMF', 'BROKER']);
    });

    it('throws BusinessRuleError with code product_version_locked when locked', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        keyFacts: [],
        quoteRequirements: [],
      });

      const lockTime = new Date('2026-10-03T10:00:00Z');
      version.lock(lockTime);

      expect(() => {
        version.edit({
          keyFacts: [{ label: 'Premium', value: '6000' }],
        });
      }).toThrow(BusinessRuleError);

      expect(codeOf(() => version.edit({ keyFacts: [{ label: 'Premium', value: '6000' }] }))).toBe('product_version_locked');
    });

    it('throws BusinessRuleError when editing a locked withdrawn version', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: today,
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();
      version.withdraw('2026-10-15');
      const lockTime = new Date('2026-10-03T10:00:00Z');
      version.lock(lockTime);

      expect(() => {
        version.edit({
          posEligible: false,
        });
      }).toThrow(BusinessRuleError);
    });
  });

  /**
   * isEffective(date) returns true only when status is 'active',
   * effectiveFrom <= date, and (no effectiveTo or date <= effectiveTo)
   */
  describe('isEffective', () => {
    it('returns false for draft status', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        quoteRequirements: [],
        keyFacts: [],
      });

      expect(version.isEffective('2026-10-15')).toBe(false);
    });

    it('returns false for withdrawn status', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();
      version.withdraw('2026-10-15');

      expect(version.isEffective('2026-10-20')).toBe(false);
    });

    it('returns true for active status within effective date range', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();

      expect(version.isEffective('2026-10-15')).toBe(true);
    });

    it('returns true on exact effectiveFrom date (inclusive)', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();

      expect(version.isEffective('2026-10-01')).toBe(true);
    });

    it('returns true on exact effectiveTo date (inclusive)', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();

      expect(version.isEffective('2026-10-31')).toBe(true);
    });

    it('returns false before effectiveFrom', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();

      expect(version.isEffective('2026-09-30')).toBe(false);
    });

    it('returns false after effectiveTo', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31',
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();

      expect(version.isEffective('2026-11-01')).toBe(false);
    });

    it('returns true for active version with no effectiveTo (open-ended)', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();

      expect(version.isEffective('2026-10-01')).toBe(true);
      expect(version.isEffective('2026-12-31')).toBe(true);
      expect(version.isEffective('2027-12-31')).toBe(true);
    });

    it('returns false before effectiveFrom even with no effectiveTo', () => {
      const version = ProductVersion.draft({
        id: 'pv_1',
        productId: 'prod_1',
        insurerId: 'ins_1',
        line: 'LIFE',
        uin: 'ABC123DEF456',
        wordingVersion: 'v1.0',
        posEligible: true,
        channels: ['IMF'],
        effectiveFrom: '2026-10-01',
        quoteRequirements: [],
        keyFacts: [],
      });

      version.activate();

      expect(version.isEffective('2026-09-30')).toBe(false);
    });
  });
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}
