import { BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';

export type FeatureFlagKey =
  | 'online_purchase'
  | 'referral_rewards'
  | 'ai_skills'
  | 'whatsapp_api'
  | 'book_import_ai'
  | 'twenty_ui';

export type GateKind = 'COMPLIANCE_REVIEW' | 'LEGAL_LOCK';

export interface Gate {
  kind: GateKind;
  reason: string;
  reviewRef?: string;
  reviewedAt?: string;
}

export interface FeatureFlag {
  key: FeatureFlagKey;
  enabled: boolean;
  gate?: Gate;
}

export class FeatureFlagSet {
  private flags: Map<FeatureFlagKey, FeatureFlag>;

  private constructor(flags: Map<FeatureFlagKey, FeatureFlag>) {
    this.flags = flags;
  }

  static defaults(): FeatureFlagSet {
    const flags = new Map<FeatureFlagKey, FeatureFlag>();

    // All disabled by default
    const allKeys: FeatureFlagKey[] = [
      'online_purchase',
      'referral_rewards',
      'ai_skills',
      'whatsapp_api',
      'book_import_ai',
      'twenty_ui',
    ];

    for (const key of allKeys) {
      if (key === 'online_purchase') {
        flags.set(key, {
          key,
          enabled: false,
          gate: {
            kind: 'COMPLIANCE_REVIEW',
            reason: 'ISNP rules require compliance review before enabling',
          },
        });
      } else if (key === 'referral_rewards') {
        flags.set(key, {
          key,
          enabled: false,
          gate: {
            kind: 'LEGAL_LOCK',
            reason: 'Rebates and inducements to policyholders are prohibited (Insurance Act s.41)',
          },
        });
      } else {
        flags.set(key, {
          key,
          enabled: false,
        });
      }
    }

    return new FeatureFlagSet(flags);
  }

  get(key: FeatureFlagKey): FeatureFlag {
    const flag = this.flags.get(key);
    if (!flag) {
      throw new Error(`Unknown feature flag: ${key}`);
    }
    return { ...flag };
  }

  enable(key: FeatureFlagKey): void {
    const flag = this.flags.get(key);
    if (!flag) {
      throw new Error(`Unknown feature flag: ${key}`);
    }

    // Check for legal lock
    if (flag.gate?.kind === 'LEGAL_LOCK') {
      throw new BusinessRuleError(
        'feature_legally_locked',
        `Feature ${key} is legally locked and cannot be enabled`
      );
    }

    // Check for compliance review requirement
    if (flag.gate?.kind === 'COMPLIANCE_REVIEW' && !flag.gate.reviewRef) {
      throw new BusinessRuleError(
        'compliance_review_required',
        `Compliance review required to enable ${key}`
      );
    }

    flag.enabled = true;
  }

  disable(key: FeatureFlagKey): void {
    const flag = this.flags.get(key);
    if (!flag) {
      throw new Error(`Unknown feature flag: ${key}`);
    }

    flag.enabled = false;
  }

  recordComplianceReview(key: FeatureFlagKey, reviewRef: string, at: Date): void {
    const flag = this.flags.get(key);
    if (!flag) {
      throw new Error(`Unknown feature flag: ${key}`);
    }

    // Can only record review for COMPLIANCE_REVIEW gates
    if (flag.gate?.kind !== 'COMPLIANCE_REVIEW') {
      throw new BusinessRuleError(
        'invalid_review_for_gate',
        `Cannot record compliance review for ${key}`
      );
    }

    // Validate review reference
    if (!reviewRef || reviewRef.length === 0) {
      throw new ValidationError('invalid_review_ref', 'Review reference is required');
    }

    // Update gate with review info
    if (flag.gate) {
      flag.gate.reviewRef = reviewRef;
      flag.gate.reviewedAt = at.toISOString();
    }

    // Enable the flag
    flag.enabled = true;
  }

  list(): FeatureFlag[] {
    return Array.from(this.flags.values()).map((f) => ({ ...f }));
  }
}
