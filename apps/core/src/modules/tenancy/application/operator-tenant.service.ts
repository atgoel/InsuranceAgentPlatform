import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../kernel/tokens';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { PlanCode, Tenant } from '../domain/tenant';
import { TENANT_DIRECTORY, TenantDirectory } from './ports';
import { TenancyRecorder } from './tenancy-recorder';
import { TenantQueryService, TenantSummary } from './tenant-query.service';
import { CachingTenantResolver } from './directory-tenant-resolver';

export const TENANT_RESOLVER_CACHE = Symbol('TenantResolverCache');

type StatusTarget = 'suspended' | 'active' | 'offboarded';
const TRANSITION: Record<StatusTarget, { apply: (t: Tenant) => void; event: string }> = {
  suspended: { apply: (t) => t.suspend(), event: 'tenant.tenant.suspended' },
  active: { apply: (t) => t.activate(), event: 'tenant.tenant.resumed' },
  offboarded: { apply: (t) => t.offboard(), event: 'tenant.tenant.offboarded' },
};

/** Operator lifecycle actions (W09). Every change is audited and evicts the resolver cache. */
@Injectable()
export class OperatorTenantService {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectory,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TENANT_RESOLVER_CACHE) private readonly resolverCache: CachingTenantResolver,
    private readonly tenants: TenantQueryService,
    private readonly recorder: TenancyRecorder,
  ) {}

  async transition(tenantId: string, to: StatusTarget, reason: string): Promise<TenantSummary> {
    const tenant = await this.tenants.require(tenantId);
    const from = tenant.props.status;
    TRANSITION[to].apply(tenant);
    await this.persist(tenant, { type: TRANSITION[to].event, data: { from, to, reason } }, `tenant.status.${to}`);
    return this.tenants.summary(tenantId);
  }

  async changePlan(tenantId: string, planCode: PlanCode, expectedVersion: number): Promise<TenantSummary> {
    const tenant = await this.tenants.require(tenantId);
    if (tenant.props.version !== expectedVersion) throw new PreconditionFailedError('version_mismatch', 'The tenant was changed by someone else; reload and retry');
    const from = tenant.props.planCode;
    tenant.changePlan(planCode);
    await this.persist(tenant, { type: 'tenant.tenant.plan_changed', data: { from, to: planCode } }, 'tenant.plan.change');
    return this.tenants.summary(tenantId);
  }

  private async persist(tenant: Tenant, event: { type: string; data: Record<string, unknown> }, action: string): Promise<void> {
    await this.directory.save(tenant);
    this.resolverCache.invalidate();
    await this.uow.run(tenant.props.id, (tx) =>
      this.recorder.record(tx, {
        event: { ...event, subject: tenant.props.id },
        audit: { action, entityType: 'tenant', entityId: tenant.props.id, metadata: event.data },
      }),
    );
  }
}
