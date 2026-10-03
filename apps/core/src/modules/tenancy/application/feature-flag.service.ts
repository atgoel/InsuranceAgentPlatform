import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, LOGGER, UNIT_OF_WORK } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { Logger } from '../../../kernel/observability/logger';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { FeatureFlag, FeatureFlagKey, FeatureFlagSet } from '../domain/feature-flags';
import { TENANT_SETTINGS_REPOSITORY, TenantSettingsRepository } from './ports';
import { TenancyRecorder } from './tenancy-recorder';

/** Feature switches incl. legally gated capabilities (referral rewards locked; online purchase needs review). */
@Injectable()
export class FeatureFlagService {
  constructor(
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly settings: TenantSettingsRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly recorder: TenancyRecorder,
  ) {}

  list(tenantId: string): Promise<FeatureFlag[]> {
    return this.uow.run(tenantId, async (tx) => (await this.settings.getFlags(tx)).list());
  }

  recordComplianceReview(tenantId: string, key: FeatureFlagKey, reviewRef: string): Promise<FeatureFlag> {
    return this.change(tenantId, key, 'tenant.flag.compliance_review', (flags) => flags.recordComplianceReview(key, reviewRef, this.clock.now()));
  }

  setEnabled(tenantId: string, key: FeatureFlagKey, enabled: boolean): Promise<FeatureFlag> {
    return this.change(tenantId, key, enabled ? 'tenant.flag.enable' : 'tenant.flag.disable', (flags) => (enabled ? flags.enable(key) : flags.disable(key)));
  }

  private change(tenantId: string, key: FeatureFlagKey, action: string, mutate: (flags: FeatureFlagSet) => void): Promise<FeatureFlag> {
    return this.uow.run(tenantId, async (tx) => {
      const flags = await this.settings.getFlags(tx);
      mutate(flags);
      await this.settings.saveFlags(tx, flags);
      const flag = flags.get(key);
      await this.recorder.record(tx, {
        event: { type: 'tenant.feature_flag.changed', subject: tenantId, data: { key, enabled: flag.enabled } },
        audit: { action, entityType: 'feature_flag', entityId: key, metadata: { enabled: flag.enabled } },
      });
      this.logger.security('security.feature_flag.changed', 'Feature flag changed', { key, enabled: flag.enabled, action });
      return flag;
    });
  }
}
