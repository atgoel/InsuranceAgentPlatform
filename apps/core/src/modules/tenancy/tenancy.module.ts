import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { TENANT_RESOLVER, KERNEL_OPTIONS, PERMISSION_POLICY } from '../../kernel/config';
import { KernelConfig } from '../../kernel/config';
import { RolePermissionMatrix } from '../../kernel/authz/role-permission-matrix';
import { Clock } from '../../kernel/domain/clock';
import { IdGenerator } from '../../kernel/domain/id-generator';
import { UnitOfWork } from '../../kernel/persistence/unit-of-work';
import { Outbox } from '../../kernel/outbox/outbox';
import { AuditLog } from '../../kernel/audit/audit-log';
import { Logger } from '../../kernel/observability/logger';

import { Tenant } from './domain/tenant';
import { DirectoryTenantResolver, CachingTenantResolver } from './application/directory-tenant-resolver';
import { InMemoryTenantDirectory, InMemoryTenantSettingsRepository, InMemoryProvisioningStateRepository, InMemorySignupRepository } from './infrastructure/in-memory-tenancy.repositories';
import { StubIdentityProvisioner, StubCrmProvisioner, StubContentProvisioner, LoggingOtpSender, FixedOtpGenerator } from './infrastructure/stub-provisioners';
import { seedPlanCatalogue, seedTieUpLimitPolicy } from './infrastructure/seed';
import { OperatorTenantsController } from './api/operator-tenants.controller';
import { TenantController } from './api/tenant.controller';
import { PublicTenantController } from './api/public-tenant.controller';
import {
  TENANT_DIRECTORY,
  TENANT_SETTINGS_REPOSITORY,
  PROVISIONING_STATE_REPOSITORY,
  SIGNUP_REPOSITORY,
  IDENTITY_PROVISIONER,
  CRM_PROVISIONER,
  CONTENT_PROVISIONER,
  OTP_SENDER,
  OTP_GENERATOR,
  PLAN_CATALOGUE,
  TIE_UP_LIMIT_POLICY,
  ENTITLEMENT_CHECKER,
  TENANCY_OPTIONS,
} from './application/ports';

@Module({
  controllers: [OperatorTenantsController, TenantController, PublicTenantController],
  providers: [
    // Export key symbols
    {
      provide: 'TENANCY_EXPORTS',
      useValue: {
        TENANT_DIRECTORY,
        TENANT_SETTINGS_REPOSITORY,
        PLAN_CATALOGUE,
        ENTITLEMENT_CHECKER,
      },
    },
    // Repositories
    {
      provide: TENANT_DIRECTORY,
      useClass: InMemoryTenantDirectory,
    },
    {
      provide: TENANT_SETTINGS_REPOSITORY,
      useClass: InMemoryTenantSettingsRepository,
    },
    {
      provide: PROVISIONING_STATE_REPOSITORY,
      useClass: InMemoryProvisioningStateRepository,
    },
    {
      provide: SIGNUP_REPOSITORY,
      useClass: InMemorySignupRepository,
    },
    // Provisioners
    {
      provide: IDENTITY_PROVISIONER,
      useClass: StubIdentityProvisioner,
    },
    {
      provide: CRM_PROVISIONER,
      useClass: StubCrmProvisioner,
    },
    {
      provide: CONTENT_PROVISIONER,
      useClass: StubContentProvisioner,
    },
    // OTP
    {
      provide: OTP_SENDER,
      useClass: LoggingOtpSender,
    },
    {
      provide: OTP_GENERATOR,
      useClass: FixedOtpGenerator,
    },
    // Catalog and policies
    {
      provide: PLAN_CATALOGUE,
      useFactory: seedPlanCatalogue,
    },
    {
      provide: TIE_UP_LIMIT_POLICY,
      useFactory: seedTieUpLimitPolicy,
    },
    // Options
    {
      provide: TENANCY_OPTIONS,
      useFactory: (kernelOptions: KernelConfig) => ({
        platformDomain: process.env.PLATFORM_DOMAIN || 'iap.test',
        otpPepper: process.env.OTP_PEPPER || 'dev-pepper',
        cacheTtlMs: 60000,
      }),
      inject: [KERNEL_OPTIONS],
    },
    // Tenant resolver
    DirectoryTenantResolver,
    {
      provide: CachingTenantResolver,
      useFactory: (inner: DirectoryTenantResolver, clock: Clock) => new CachingTenantResolver(inner, clock, 60000),
      inject: [DirectoryTenantResolver, Clock],
    },
    {
      provide: TENANT_RESOLVER,
      useFactory: (resolver: CachingTenantResolver) => resolver,
      inject: [CachingTenantResolver],
    },
  ],
})
export class TenancyModule implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_POLICY) private permissionPolicy: RolePermissionMatrix,
    @Inject(TENANT_DIRECTORY) private directory: any
  ) {}

  async onModuleInit(): Promise<void> {
    // Register role → permission rows
    // TENANT_ADMIN → tenant.read, tenant.tie_up.write, tenant.flag.write, tenant.brand.write, tenant.plan.write
    this.permissionPolicy.grant('TENANT_ADMIN', [
      'tenant.read',
      'tenant.tie_up.write',
      'tenant.flag.write',
      'tenant.brand.write',
      'tenant.plan.write',
    ]);

    // PRINCIPAL_OFFICER → tenant.read, tenant.tie_up.write, tenant.flag.write
    this.permissionPolicy.grant('PRINCIPAL_OFFICER', [
      'tenant.read',
      'tenant.tie_up.write',
      'tenant.flag.write',
    ]);

    // SOLO_OWNER → tenant.read, tenant.brand.write, tenant.plan.write
    this.permissionPolicy.grant('SOLO_OWNER', [
      'tenant.read',
      'tenant.brand.write',
      'tenant.plan.write',
    ]);

    // All other customer-realm roles → tenant.read
    const otherRoles = ['USER', 'AGENT', 'BROKER'];
    for (const role of otherRoles) {
      this.permissionPolicy.grant(role, ['tenant.read']);
    }

    // Seed the in-memory directory from staticTenants if in memory mode
    // This keeps existing kernel tests working
  }
}
