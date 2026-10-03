import { FeatureFlagSet } from './feature-flags';
import { BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M01-04: Feature flags: referral rewards cannot be enabled (feature_legally_locked);
 * online purchase cannot be enabled until a compliance review reference is recorded;
 * every change is audited and security-logged.
 */
describe('AC-M01-04 FeatureFlags', () => {
  describe('defaults', () => {
    it('creates defaults with all flags disabled', () => {
      const flags = FeatureFlagSet.defaults();
      expect(flags.get('online_purchase').enabled).toBe(false);
      expect(flags.get('referral_rewards').enabled).toBe(false);
      expect(flags.get('ai_skills').enabled).toBe(false);
      expect(flags.get('whatsapp_api').enabled).toBe(false);
      expect(flags.get('book_import_ai').enabled).toBe(false);
      expect(flags.get('twenty_ui').enabled).toBe(false);
    });

    it('sets online_purchase gate to COMPLIANCE_REVIEW', () => {
      const flags = FeatureFlagSet.defaults();
      const flag = flags.get('online_purchase');
      expect(flag.gate).toBeDefined();
      expect(flag.gate?.kind).toBe('COMPLIANCE_REVIEW');
    });

    it('sets referral_rewards gate to LEGAL_LOCK', () => {
      const flags = FeatureFlagSet.defaults();
      const flag = flags.get('referral_rewards');
      expect(flag.gate).toBeDefined();
      expect(flag.gate?.kind).toBe('LEGAL_LOCK');
    });
  });

  describe('enable', () => {
    it('enables a flag without gate', () => {
      const flags = FeatureFlagSet.defaults();
      flags.enable('ai_skills');

      expect(flags.get('ai_skills').enabled).toBe(true);
    });

    it('requires compliance review reference for online_purchase', () => {
      const flags = FeatureFlagSet.defaults();

      expect(() => flags.enable('online_purchase')).toThrow(BusinessRuleError);
    });

    it('never allows enabling referral_rewards (legally locked)', () => {
      const flags = FeatureFlagSet.defaults();

      expect(() => flags.enable('referral_rewards')).toThrow(BusinessRuleError);
    });
  });

  describe('recordComplianceReview', () => {
    it('enables online_purchase after recording compliance review', () => {
      const flags = FeatureFlagSet.defaults();
      const now = new Date('2026-01-01T00:00:00Z');

      flags.recordComplianceReview('online_purchase', 'REV-2026-001', now);

      const flag = flags.get('online_purchase');
      expect(flag.enabled).toBe(true);
      expect(flag.gate?.reviewRef).toBe('REV-2026-001');
      expect(flag.gate?.reviewedAt).toBeDefined();
    });

    it('rejects recording review for LEGAL_LOCK gate', () => {
      const flags = FeatureFlagSet.defaults();

      expect(() =>
        flags.recordComplianceReview('referral_rewards', 'REV-001', new Date()),
      ).toThrow(BusinessRuleError);
    });

    it('validates review reference format', () => {
      const flags = FeatureFlagSet.defaults();

      expect(() =>
        flags.recordComplianceReview('online_purchase', '', new Date()),
      ).toThrow(ValidationError);
    });
  });

  describe('disable', () => {
    it('disables an enabled flag', () => {
      const flags = FeatureFlagSet.defaults();
      flags.enable('ai_skills');
      expect(flags.get('ai_skills').enabled).toBe(true);

      flags.disable('ai_skills');
      expect(flags.get('ai_skills').enabled).toBe(false);
    });
  });

  describe('list', () => {
    it('returns all feature flags', () => {
      const flags = FeatureFlagSet.defaults();
      const list = flags.list();

      expect(list).toHaveLength(6);
      expect(list.map((f) => f.key)).toContain('online_purchase');
      expect(list.map((f) => f.key)).toContain('referral_rewards');
    });

    it('includes gate information in list', () => {
      const flags = FeatureFlagSet.defaults();
      const list = flags.list();

      const onlinePurchase = list.find((f) => f.key === 'online_purchase');
      expect(onlinePurchase?.gate?.kind).toBe('COMPLIANCE_REVIEW');
    });
  });
});
