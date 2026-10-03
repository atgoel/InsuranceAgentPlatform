import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { ConflictError, NotFoundError } from '../../../kernel/errors/domain-errors';
import { PlanCode, Tenant, TenantKind, TenantStatus } from '../domain/tenant';
import { DistributorEntity, EntityType } from '../domain/distributor-entity';
import { FeatureFlagSet } from '../domain/feature-flags';
import { BrandKit } from '../domain/brand-kit';
import { PROVISIONING_SAGA, TENANCY_OPTIONS, TENANT_DIRECTORY, TENANT_SETTINGS_REPOSITORY, TenancyOptions, TenantDirectory, TenantSettingsRepository } from './ports';
import { AdminContact, ProvisioningSaga } from './provisioning-saga';
import { TenancyRecorder } from './tenancy-recorder';

export interface ProvisionTenantInput {
  slug: string;
  displayName: string;
  kind: TenantKind;
  planCode: PlanCode;
  entity: { entityType: EntityType; legalName: string; registrationNo: string; registrationValidTo: string; principalOfficerName?: string };
  admin: AdminContact;
}

export interface ProvisionResult {
  tenantId: string;
  status: TenantStatus;
  host: string;
  failedStep?: string;
}

/** Operator-assisted provisioning (F01, F44) and the entry point for solo self-signup (F94). */
@Injectable()
export class ProvisionTenantService {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectory,
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly settings: TenantSettingsRepository,
    @Inject(PROVISIONING_SAGA) private readonly saga: ProvisioningSaga,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(TENANCY_OPTIONS) private readonly options: TenancyOptions,
    private readonly recorder: TenancyRecorder,
  ) {}

  async provision(input: ProvisionTenantInput): Promise<ProvisionResult> {
    if (await this.directory.findBySlug(input.slug)) throw new ConflictError('slug_taken', 'This tenant slug is already in use');
    const now = this.clock.now();
    // Validate everything before any write.
    const tenant = Tenant.create({ id: this.ids.next('ten'), slug: input.slug, displayName: input.displayName, kind: input.kind, planCode: input.planCode, now });
    const entity = DistributorEntity.create({ tenantKind: input.kind, ...input.entity });
    const host = `${input.slug}.${this.options.platformDomain}`;

    await this.directory.save(tenant);
    await this.directory.addHost({ tenantId: tenant.props.id, host, kind: 'platform_subdomain', verifiedAt: now.toISOString() });
    await this.uow.run(tenant.props.id, async (tx) => {
      await this.settings.saveEntity(tx, entity);
      await this.settings.saveFlags(tx, FeatureFlagSet.defaults());
      await this.settings.saveBrandKit(tx, BrandKit.platformDefault());
      await this.recorder.record(tx, {
        event: { type: 'tenant.tenant.provisioning_started', subject: tenant.props.id, data: { kind: input.kind, planCode: input.planCode, entityType: input.entity.entityType } },
        audit: { action: 'tenant.provision', entityType: 'tenant', entityId: tenant.props.id, after: tenant.props },
      });
    });
    return this.runSaga(tenant, input.admin, host);
  }

  async resume(tenantId: string): Promise<ProvisionResult> {
    const tenant = await this.directory.findById(tenantId);
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    const [host] = await this.directory.listHosts(tenantId);
    if (tenant.props.status !== 'provisioning') return { tenantId, status: tenant.props.status, host: host?.host ?? '' };
    return this.runSaga(tenant, { name: tenant.props.displayName }, host?.host ?? '');
  }

  private async runSaga(tenant: Tenant, admin: AdminContact, host: string): Promise<ProvisionResult> {
    const outcome = await this.saga.run({ tenant, admin, host });
    if (!outcome.ok) return { tenantId: tenant.props.id, status: tenant.props.status, host, failedStep: outcome.failedStep };
    tenant.activate();
    await this.directory.save(tenant);
    await this.uow.run(tenant.props.id, (tx) =>
      this.recorder.record(tx, {
        event: { type: 'tenant.tenant.provisioned', subject: tenant.props.id, data: { kind: tenant.props.kind, planCode: tenant.props.planCode, crmMode: tenant.props.crmMode } },
        audit: { action: 'tenant.activate', entityType: 'tenant', entityId: tenant.props.id },
      }),
    );
    return { tenantId: tenant.props.id, status: tenant.props.status, host };
  }
}
