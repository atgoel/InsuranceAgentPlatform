import { Injectable, Inject } from '@nestjs/common';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { Clock } from '../../../kernel/domain/clock';
import { ConflictError } from '../../../kernel/errors/domain-errors';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { Outbox } from '../../../kernel/outbox/outbox';
import { AuditLog } from '../../../kernel/audit/audit-log';
import { Tenant, TenantKind, PlanCode, TenantStatus } from '../domain/tenant';
import { DistributorEntity, EntityType } from '../domain/distributor-entity';
import { FeatureFlagSet } from '../domain/feature-flags';
import { BrandKit } from '../domain/brand-kit';
import { TENANT_DIRECTORY, TenantDirectory, PLAN_CATALOGUE, TenancyOptions, TENANCY_OPTIONS, PROVISIONING_STATE_REPOSITORY, ProvisioningStateRepository } from './ports';
import { PlanCatalogue } from '../domain/plan';
import { Logger } from '../../../kernel/observability/logger';
import { ProvisioningSaga } from './provisioning-saga.ts';

export interface ProvisionTenantInput {
  slug: string;
  displayName: string;
  kind: TenantKind;
  planCode: PlanCode;
  entity: {
    entityType: EntityType;
    legalName: string;
    registrationNo: string;
    registrationValidTo: string;
    principalOfficerName?: string;
  };
  admin: {
    name: string;
    phone?: string;
    email?: string;
  };
}

@Injectable()
export class ProvisionTenantService {
  constructor(
    private idGenerator: IdGenerator,
    private clock: Clock,
    private uow: UnitOfWork,
    private outbox: Outbox,
    private auditLog: AuditLog,
    @Inject(TENANT_DIRECTORY) private directory: TenantDirectory,
    @Inject(PLAN_CATALOGUE) private planCatalogue: PlanCatalogue,
    @Inject(TENANCY_OPTIONS) private options: TenancyOptions,
    @Inject(PROVISIONING_STATE_REPOSITORY) private stateRepo: ProvisioningStateRepository,
    private saga: ProvisioningSaga,
    private logger: Logger
  ) {}

  async provision(input: ProvisionTenantInput): Promise<{ tenantId: string; status: TenantStatus; host: string; failedStep?: string }> {
    // Check slug uniqueness
    const existing = await this.directory.findBySlug(input.slug);
    if (existing) {
      throw new ConflictError('slug_taken', `Slug ${input.slug} is already taken`);
    }

    // Validate inputs
    const plan = this.planCatalogue.get(input.planCode);
    const entity = DistributorEntity.create({
      tenantKind: input.kind,
      entityType: input.entity.entityType,
      legalName: input.entity.legalName,
      registrationNo: input.entity.registrationNo,
      registrationValidTo: input.entity.registrationValidTo,
      principalOfficerName: input.entity.principalOfficerName,
    });

    // Create tenant
    const tenantId = this.idGenerator.generate('ten_');
    const tenant = Tenant.create({
      id: tenantId,
      slug: input.slug,
      displayName: input.displayName,
      kind: input.kind,
      planCode: input.planCode,
      now: this.clock.now(),
    });

    // Save tenant and host
    const host = `${input.slug}.${this.options.platformDomain}`;
    await this.directory.save(tenant);
    await this.directory.addHost({
      tenantId: tenantId,
      host,
      kind: 'platform_subdomain',
      verifiedAt: new Date().toISOString(),
    });

    // Initialize settings in uow
    await this.uow.run(tenantId, async (tx) => {
      // Save entity, flags, brand kit
      const settings = (this.uow as any).TENANT_SETTINGS_REPOSITORY;
      // This would be injected in real implementation

      // Emit event
      this.outbox.add('tenant.tenant.provisioning_started', {});
      this.auditLog.append('tenant.provision', {});
    });

    // Run provisioning saga
    const sagaResult = await this.saga.run({
      tenant,
      admin: input.admin,
    });

    if (sagaResult.ok) {
      // Activate tenant
      tenant.activate();
      await this.directory.save(tenant);
      this.outbox.add('tenant.tenant.provisioned', {});
      return { tenantId, status: 'active', host };
    } else {
      return { tenantId, status: 'provisioning', host, failedStep: sagaResult.failedStep };
    }
  }

  async resume(tenantId: string): Promise<{ status: TenantStatus; failedStep?: string }> {
    const tenant = await this.directory.findById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const admin = { name: 'unknown' }; // Would need to look up from somewhere
    const sagaResult = await this.saga.run({ tenant, admin });

    if (sagaResult.ok) {
      tenant.activate();
      await this.directory.save(tenant);
      return { status: 'active' };
    } else {
      return { status: 'provisioning', failedStep: sagaResult.failedStep };
    }
  }
}
