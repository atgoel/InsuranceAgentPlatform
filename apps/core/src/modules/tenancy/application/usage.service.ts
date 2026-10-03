import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, LOGGER, METRICS, UNIT_OF_WORK } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { Logger } from '../../../kernel/observability/logger';
import { MetricsRegistry } from '../../../kernel/observability/metrics';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { RateLimitedError } from '../../../kernel/errors/domain-errors';
import { Capability, PlanCatalogue, UsageMetric } from '../domain/plan';
import { FeatureFlagKey } from '../domain/feature-flags';
import { UsageMeter } from '../domain/usage';
import { EntitlementChecker, PLAN_CATALOGUE, TENANT_SETTINGS_REPOSITORY, TenantSettingsRepository } from './ports';
import { TenancyRecorder } from './tenancy-recorder';
import { TenantQueryService, periodOf } from './tenant-query.service';

/** Flags that additionally require a plan capability. */
const FLAG_CAPABILITY: Partial<Record<FeatureFlagKey, Capability>> = { ai_skills: 'AI', book_import_ai: 'AI' };

/** Facade other modules use for plan capabilities, switches and metered usage (F99). */
@Injectable()
export class UsageService implements EntitlementChecker {
  constructor(
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly settings: TenantSettingsRepository,
    @Inject(PLAN_CATALOGUE) private readonly plans: PlanCatalogue,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(METRICS) private readonly metrics: MetricsRegistry,
    private readonly tenants: TenantQueryService,
    private readonly recorder: TenancyRecorder,
  ) {}

  async hasCapability(tenantId: string, capability: Capability): Promise<boolean> {
    return (await this.planOf(tenantId)).capabilities.has(capability);
  }

  async isFeatureEnabled(tenantId: string, key: FeatureFlagKey): Promise<boolean> {
    const required = FLAG_CAPABILITY[key];
    if (required && !(await this.hasCapability(tenantId, required))) return false;
    return this.uow.run(tenantId, async (tx) => (await this.settings.getFlags(tx)).get(key).enabled);
  }

  async limitFor(tenantId: string, metric: UsageMetric): Promise<number | null> {
    return (await this.planOf(tenantId)).limits[metric];
  }

  async consume(tenantId: string, metric: UsageMetric, amount: number): Promise<void> {
    const plan = await this.planOf(tenantId);
    const now = this.clock.now();
    const period = periodOf(now);
    await this.uow.run(tenantId, async (tx) => {
      const counter = (await this.settings.getUsage(tx, metric, period)) ?? { metric, period, used: 0, limit: plan.limits[metric] };
      const result = UsageMeter.consume(counter, amount, plan.alertThresholdPct, now);
      if (!result.allowed) {
        this.metrics.counter('tenant_usage_denied_total', 'Usage denied by plan limits', ['metric']).inc({ metric });
        throw new RateLimitedError('usage_limit_exceeded', `The plan limit for ${metric} has been reached`, { metric, limit: counter.limit, retryAfterSeconds: 3600 });
      }
      await this.settings.saveUsage(tx, result.counter);
      if (result.crossedThreshold) await this.announceThreshold(tx, metric, UsageMeter.percentUsed(result.counter), period);
    });
  }

  private async announceThreshold(tx: Parameters<TenancyRecorder['record']>[0], metric: UsageMetric, percent: number | null, period: string): Promise<void> {
    this.logger.info('tenant.usage.threshold_crossed', 'Usage alert threshold crossed', { metric, percent, period });
    await this.recorder.record(tx, {
      event: { type: 'tenant.usage.threshold_crossed', subject: tx.tenantId, data: { metric, percent, period } },
      audit: { action: 'tenant.usage.threshold_crossed', entityType: 'usage', entityId: `${metric}:${period}` },
    });
  }

  private async planOf(tenantId: string) {
    return this.plans.get((await this.tenants.require(tenantId)).props.planCode);
  }
}
