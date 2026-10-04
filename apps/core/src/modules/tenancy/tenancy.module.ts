import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { Pool } from 'pg';
import {
  APP_POOL,
  CLOCK,
  KERNEL_OPTIONS,
  LOGGER,
  METRICS,
  CUSTOM_FIELD_DEFINITIONS,
  PERMISSION_POLICY,
  PLATFORM_POOL,
  TENANT_RESOLVER,
  UNIT_OF_WORK,
} from '../../kernel/tokens';
import { AesGcmFieldCipher, fieldMasterKey } from '../../kernel/crypto/aes-gcm-field-cipher';
import { KernelConfig } from '../../kernel/config';
import { Clock } from '../../kernel/domain/clock';
import { Logger } from '../../kernel/observability/logger';
import { MetricsRegistry } from '../../kernel/observability/metrics';
import { UnitOfWork } from '../../kernel/persistence/unit-of-work';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { DelegatingTenantResolver } from '../../kernel/tenancy/tenant-resolver';
import {
  CONTENT_PROVISIONER,
  CRM_PROVISIONER,
  CUSTOM_FIELD_REPOSITORY,
  ContentProvisioner,
  CustomFieldRepository,
  CrmProvisioner,
  ENTITLEMENT_CHECKER,
  IDENTITY_PROVISIONER,
  IdentityProvisioner,
  OTP_GENERATOR,
  OTP_SENDER,
  PLAN_CATALOGUE,
  PROVISIONING_SAGA,
  PROVISIONING_STATE_REPOSITORY,
  ProvisioningStateRepository,
  SIGNUP_REPOSITORY,
  SignupRepository,
  TENANCY_OPTIONS,
  TENANT_DIRECTORY,
  TENANT_SETTINGS_REPOSITORY,
  TIE_UP_LIMIT_POLICY,
  TIE_UP_READER,
  TenancyOptions,
  TenantDirectory,
  TenantSettingsRepository,
} from './application/ports';
import { PlanCatalogue } from './domain/plan';
import { TieUpLimitPolicy } from './domain/tie-up';
import {
  ContentScopeStep,
  CrmWorkspaceStep,
  IdentityAdminStep,
  IdentityOrganisationStep,
  ProvisioningSaga,
  SmokeCheckStep,
} from './application/provisioning-saga';
import { CachingTenantResolver, DirectoryTenantResolver } from './application/directory-tenant-resolver';
import { TenancyRecorder } from './application/tenancy-recorder';
import { ProvisionTenantService } from './application/provision-tenant.service';
import { TenantQueryService } from './application/tenant-query.service';
import { TieUpService } from './application/tie-up.service';
import { FeatureFlagService } from './application/feature-flag.service';
import { BrandKitService } from './application/brand-kit.service';
import { UsageService } from './application/usage.service';
import { OperatorTenantService, TENANT_RESOLVER_CACHE } from './application/operator-tenant.service';
import { SoloSignupService } from './application/solo-signup.service';
import { TrialService } from './application/trial.service';
import { CustomFieldService } from './application/custom-field.service';
import { InMemoryCustomFieldRepository } from './infrastructure/in-memory-custom-field.repository';
import { PgCustomFieldRepository } from './infrastructure/pg-custom-field.repository';
import {
  InMemoryProvisioningStateRepository,
  InMemorySignupRepository,
  InMemoryTenantDirectory,
  InMemoryTenantSettingsRepository,
} from './infrastructure/in-memory-tenancy.repositories';
import {
  FixedOtpGenerator,
  LoggingOtpSender,
  RandomOtpGenerator,
  StubContentProvisioner,
  StubCrmProvisioner,
  StubIdentityProvisioner,
} from './infrastructure/stub-provisioners';
import { seedStaticTenants } from './infrastructure/static-tenant-seeder';
import {
  PgProvisioningStateRepository,
  PgSignupRepository,
  PgTenantDirectory,
  PgTenantSettingsRepository,
} from './infrastructure/pg-tenancy.repositories';
import { OperatorTenantsController } from './api/operator-tenants.controller';
import { TenantController } from './api/tenant.controller';
import { PublicTenantController } from './api/public-tenant.controller';

/** Role → permission rows this module contributes to the policy (M01 §6.4). */
export const TENANCY_PERMISSIONS: Record<string, string[]> = {
  TENANT_ADMIN: [
    'tenant.read',
    'tenant.tie_up.write',
    'tenant.flag.write',
    'tenant.brand.write',
    'tenant.plan.write',
    'tenant.custom_field.write',
  ],
  PRINCIPAL_OFFICER: ['tenant.read', 'tenant.tie_up.write', 'tenant.flag.write'],
  SOLO_OWNER: ['tenant.read', 'tenant.brand.write', 'tenant.plan.write', 'tenant.custom_field.write'],
  BRANCH_MANAGER: ['tenant.read'],
  SALES_MANAGER: ['tenant.read'],
  SALESPERSON: ['tenant.read'],
  OPS: ['tenant.read'],
  FINANCE: ['tenant.read'],
  COMPLIANCE: ['tenant.read'],
  CMS_AUTHOR: ['tenant.read'],
  CMS_PUBLISHER: ['tenant.read'],
};

function tenancyOptions(config: KernelConfig): TenancyOptions {
  return {
    platformDomain: process.env.PLATFORM_DOMAIN ?? (config.env === 'production' ? 'iap.example' : 'iap.test'),
    otpPepper: process.env.OTP_PEPPER ?? config.actorPepper,
    cacheTtlMs: 60_000,
  };
}

/** In-memory adapters by default; Postgres when PERSISTENCE=pg (directory/signups/provisioning via the owner pool). */
function byPersistence(): Provider[] {
  const pick = <T>(provide: symbol, memory: () => T, pgFactory: (app: Pool, owner: Pool, config: KernelConfig) => T): Provider => ({
    provide,
    useFactory: (config: KernelConfig, app?: Pool, owner?: Pool) =>
      config.persistence === 'pg' && app && owner ? pgFactory(app, owner, config) : memory(),
    inject: [KERNEL_OPTIONS, APP_POOL, PLATFORM_POOL],
  });
  return [
    pick<TenantDirectory>(
      TENANT_DIRECTORY,
      () => new InMemoryTenantDirectory(),
      (app, owner) => new PgTenantDirectory(app, owner),
    ),
    pick<TenantSettingsRepository>(
      TENANT_SETTINGS_REPOSITORY,
      () => new InMemoryTenantSettingsRepository(),
      () => new PgTenantSettingsRepository(),
    ),
    pick<CustomFieldRepository>(
      CUSTOM_FIELD_REPOSITORY,
      () => new InMemoryCustomFieldRepository(),
      () => new PgCustomFieldRepository(),
    ),
    pick<ProvisioningStateRepository>(
      PROVISIONING_STATE_REPOSITORY,
      () => new InMemoryProvisioningStateRepository(),
      (_app, owner) => new PgProvisioningStateRepository(owner),
    ),
    pick<SignupRepository>(
      SIGNUP_REPOSITORY,
      () => new InMemorySignupRepository(),
      (_app, owner, config) => new PgSignupRepository(owner, new AesGcmFieldCipher(fieldMasterKey(config))),
    ),
  ];
}

const adapters: Provider[] = [
  { provide: TENANCY_OPTIONS, useFactory: tenancyOptions, inject: [KERNEL_OPTIONS] },
  ...byPersistence(),
  { provide: PLAN_CATALOGUE, useValue: PlanCatalogue.default() },
  { provide: TIE_UP_LIMIT_POLICY, useValue: TieUpLimitPolicy.default() },
  {
    provide: IDENTITY_PROVISIONER,
    useFactory: (l: Logger) => new StubIdentityProvisioner(l.child({ module: 'tenancy' })),
    inject: [LOGGER],
  },
  { provide: CRM_PROVISIONER, useFactory: (l: Logger) => new StubCrmProvisioner(l.child({ module: 'tenancy' })), inject: [LOGGER] },
  { provide: CONTENT_PROVISIONER, useFactory: (l: Logger) => new StubContentProvisioner(l.child({ module: 'tenancy' })), inject: [LOGGER] },
  { provide: OTP_SENDER, useFactory: (l: Logger) => new LoggingOtpSender(l.child({ module: 'tenancy' })), inject: [LOGGER] },
  {
    provide: OTP_GENERATOR,
    useFactory: (c: KernelConfig) => (c.env === 'production' ? new RandomOtpGenerator() : new FixedOtpGenerator()),
    inject: [KERNEL_OPTIONS],
  },
];

const saga: Provider = {
  provide: PROVISIONING_SAGA,
  useFactory: (
    identity: IdentityProvisioner,
    crm: CrmProvisioner,
    content: ContentProvisioner,
    directory: TenantDirectory,
    state: ProvisioningStateRepository,
    logger: Logger,
  ) =>
    new ProvisioningSaga(
      [
        new IdentityOrganisationStep(identity),
        new IdentityAdminStep(identity),
        new CrmWorkspaceStep(crm),
        new ContentScopeStep(content),
        new SmokeCheckStep(directory),
      ],
      state,
      logger.child({ module: 'tenancy' }),
    ),
  inject: [IDENTITY_PROVISIONER, CRM_PROVISIONER, CONTENT_PROVISIONER, TENANT_DIRECTORY, PROVISIONING_STATE_REPOSITORY, LOGGER],
};

const resolverCache: Provider = {
  provide: TENANT_RESOLVER_CACHE,
  useFactory: (directory: TenantDirectory, clock: Clock, options: TenancyOptions, metrics: MetricsRegistry) =>
    new CachingTenantResolver(new DirectoryTenantResolver(directory), clock, options.cacheTtlMs, metrics),
  inject: [TENANT_DIRECTORY, CLOCK, TENANCY_OPTIONS, METRICS],
};

const services: Provider[] = [
  TenancyRecorder,
  ProvisionTenantService,
  TenantQueryService,
  TieUpService,
  FeatureFlagService,
  BrandKitService,
  UsageService,
  OperatorTenantService,
  SoloSignupService,
  TrialService,
  CustomFieldService,
  { provide: CUSTOM_FIELD_DEFINITIONS, useExisting: CUSTOM_FIELD_REPOSITORY },
  { provide: ENTITLEMENT_CHECKER, useExisting: UsageService },
  { provide: TIE_UP_READER, useExisting: TieUpService },
];

/**
 * M01 Tenant & Entitlements. Owns the tenant directory and swaps it into the kernel's tenant resolution,
 * so "tenant from trust" (verified host) is backed by the directory rather than static config.
 */
@Module({
  controllers: [OperatorTenantsController, TenantController, PublicTenantController],
  providers: [...adapters, saga, resolverCache, ...services],
  exports: [
    CUSTOM_FIELD_DEFINITIONS,
    ENTITLEMENT_CHECKER,
    TIE_UP_READER,
    TENANT_DIRECTORY,
    TENANT_SETTINGS_REPOSITORY,
    PLAN_CATALOGUE,
    TENANT_RESOLVER_CACHE,
  ],
})
export class TenancyModule implements OnModuleInit {
  constructor(
    @Inject(TENANT_RESOLVER) private readonly kernelResolver: DelegatingTenantResolver,
    @Inject(TENANT_RESOLVER_CACHE) private readonly directoryResolver: CachingTenantResolver,
    @Inject(PERMISSION_POLICY) private readonly permissions: RolePermissionMatrix,
    @Inject(KERNEL_OPTIONS) private readonly config: KernelConfig,
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectory,
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly settings: TenantSettingsRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const [role, perms] of Object.entries(TENANCY_PERMISSIONS)) this.permissions.grant(role, perms);
    if (this.config.env !== 'production') {
      await seedStaticTenants(this.config.staticTenants, {
        directory: this.directory,
        settings: this.settings,
        uow: this.uow,
        clock: this.clock,
      });
    }
    this.kernelResolver.delegateTo(this.directoryResolver);
  }
}
