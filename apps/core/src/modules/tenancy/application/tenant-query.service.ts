import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { Tenant, TenantKind, TenantStatus } from '../domain/tenant';
import { PlanCatalogue, UsageMetric } from '../domain/plan';
import { UsageCounter, UsageMeter } from '../domain/usage';
import { FeatureFlag } from '../domain/feature-flags';
import { PLAN_CATALOGUE, TENANT_DIRECTORY, TENANT_SETTINGS_REPOSITORY, TenantDirectory, TenantSettingsRepository } from './ports';

export const USAGE_METRICS: UsageMetric[] = ['seats', 'customers', 'ai_credits', 'messages'];

export function periodOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export interface TenantSummary {
  id: string; slug: string; displayName: string; kind: TenantKind; status: TenantStatus; planCode: string; cell: string; entityType?: string; createdAt: string; version: number;
}

/** Read side for tenant profile, entitlements and the operator list (M01 §5.2). */
@Injectable()
export class TenantQueryService {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectory,
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly settings: TenantSettingsRepository,
    @Inject(PLAN_CATALOGUE) private readonly plans: PlanCatalogue,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async require(tenantId: string): Promise<Tenant> {
    const tenant = await this.directory.findById(tenantId);
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    return tenant;
  }

  async profile(tenantId: string) {
    const tenant = await this.require(tenantId);
    const entity = await this.uow.run(tenantId, (tx) => this.settings.getEntity(tx));
    const hosts = await this.directory.listHosts(tenantId);
    return {
      ...pickTenant(tenant),
      trialEndsAt: tenant.props.trialEndsAt,
      crmMode: tenant.props.crmMode,
      entity: entity && { entityType: entity.entityType, legalName: entity.legalName, registrationNo: entity.registrationNo, registrationValidTo: entity.registrationValidTo, principalOfficerName: entity.principalOfficerName },
      registrationStatus: entity?.registrationStatus(this.clock.now()),
      comparisonScope: entity?.comparisonScope(),
      hosts: hosts.map((h) => ({ host: h.host, kind: h.kind, verified: Boolean(h.verifiedAt) })),
    };
  }

  async entitlements(tenantId: string) {
    const tenant = await this.require(tenantId);
    const plan = this.plans.get(tenant.props.planCode);
    const period = periodOf(this.clock.now());
    const { counters, flags } = await this.uow.run(tenantId, async (tx) => ({
      counters: await Promise.all(USAGE_METRICS.map((m) => this.settings.getUsage(tx, m, period))),
      flags: (await this.settings.getFlags(tx)).list(),
    }));
    return {
      plan: { code: plan.code, name: plan.name, capabilities: [...plan.capabilities].sort(), limits: plan.limits, alertThresholdPct: plan.alertThresholdPct },
      usage: USAGE_METRICS.map((metric, i) => usageView(counters[i] ?? { metric, period, used: 0, limit: plan.limits[metric] })),
      flags: flags as FeatureFlag[],
    };
  }

  async summary(tenantId: string): Promise<TenantSummary> {
    const tenant = await this.require(tenantId);
    return this.toSummary(tenant);
  }

  async listForOperator(filter: { status?: TenantStatus; kind?: TenantKind; cursor?: string; limit: number }) {
    const page = await this.directory.list(filter);
    return { items: await Promise.all(page.items.map((t) => this.toSummary(t))), nextCursor: page.nextCursor };
  }

  private async toSummary(tenant: Tenant): Promise<TenantSummary> {
    const entity = await this.uow.run(tenant.props.id, (tx) => this.settings.getEntity(tx));
    return { ...pickTenant(tenant), cell: tenant.props.cell, entityType: entity?.entityType, createdAt: tenant.props.createdAt, version: tenant.props.version };
  }
}

function pickTenant(t: Tenant) {
  const p = t.props;
  return { id: p.id, slug: p.slug, displayName: p.displayName, kind: p.kind, status: p.status, planCode: p.planCode, version: p.version };
}

function usageView(c: UsageCounter) {
  return { ...c, percentUsed: UsageMeter.percentUsed(c) };
}
