import { Inject, Module, OnModuleInit, Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { ValidationError } from '../../kernel/errors/domain-errors';
import { APP_POOL, PLATFORM_POOL, KERNEL_OPTIONS, PERMISSION_POLICY, AUDIT_LOG, CLOCK, LOGGER } from '../../kernel/tokens';
import { KernelConfig } from '../../kernel/config';
import { RolePermissionMatrix } from '../../kernel/tenancy/permissions';
import { AuditLog } from '../../kernel/audit/audit-log';
import { Clock } from '../../kernel/domain/clock';
import { Logger } from '../../kernel/observability/logger';
import { FieldCipher } from '../../kernel/crypto/aes-gcm-field-cipher';
import { PartyModule } from '../party/party.module';
import { FIELD_CIPHER } from '../party/application/ports';
import { TenancyModule } from '../tenancy/tenancy.module';
import * as ports from './application/ports';
import * as memory from './infrastructure/in-memory-integration.repositories';
import * as pg from './infrastructure/pg-integration.repositories';
import { RegisteredAdapters, UnboundCredentialVault } from './infrastructure/adapter-registry';
import { AssistedAdapter } from './infrastructure/adapters/assisted.adapter';
import { FakeInsurerAdapter } from './infrastructure/adapters/fake-insurer.adapter';
import { SandboxRunner } from './infrastructure/sandbox-certification-runner';
import { IntegrationContext, IntegrationRuntime } from './application/integration-context';
import { IntegrationResources, IntegrationWork } from './application/integration-resources';
import { IntegrationExecutor } from './application/integration-executor';
import { IntegrationRouting } from './application/integration-routing';
import { IntegrationGateway } from './application/integration-gateway';
import { SubmissionService } from './application/submission.service';
import { DeadLetterWriter } from './application/dead-letter-writer';
import { DeadLetterService } from './application/dead-letter.service';
import { CallbackService } from './application/callback.service';
import { CertificationService } from './application/certification.service';
import { IntegrationAdminService } from './application/integration-admin.service';
import { ReconciliationJob } from './application/reconciliation.job';
import { RetentionJob } from './application/retention.job';
import { ProbeJob } from './application/probe.job';
import { IntegrationsController } from './api/integrations.controller';
import { CallbacksController } from './api/callbacks.controller';
function persistence<T>(provide: symbol, makeMemory: () => T, makePg: () => T): Provider {
  return {
    provide,
    inject: [KERNEL_OPTIONS, APP_POOL],
    useFactory: (config: KernelConfig, app?: Pool) => config.persistence === 'pg' && app ? makePg() : makeMemory(),
  };
}
const repositories: Provider[] = [
  persistence<ports.PinRepository>(ports.PIN_REPOSITORY, () => new memory.InMemoryPinRepository(), () => new pg.PgPinRepository()),
  persistence<ports.CertificationRepository>(ports.CERTIFICATION_REPOSITORY, () => new memory.InMemoryCertificationRepository(), () => new pg.PgCertificationRepository()),
  persistence<ports.SubmissionRepository>(ports.SUBMISSION_REPOSITORY, () => new memory.InMemorySubmissionRepository(), () => new pg.PgSubmissionRepository()),
  persistence<ports.DeadLetterRepository>(ports.DEAD_LETTER_REPOSITORY, () => new memory.InMemoryDeadLetterRepository(), () => new pg.PgDeadLetterRepository()),
  persistence<ports.EncryptedPayloadRepository>(ports.ENCRYPTED_PAYLOAD_REPOSITORY,
    () => new memory.InMemoryEncryptedPayloadRepository(), () => new pg.PgEncryptedPayloadRepository()),
  persistence<ports.IntegrationCallLog>(ports.INTEGRATION_CALL_LOG, () => new memory.InMemoryIntegrationCallLog(), () => new pg.PgIntegrationCallLog()),
  persistence<ports.IntegrationHealthRepository>(ports.INTEGRATION_HEALTH_REPOSITORY,
    () => new memory.InMemoryIntegrationHealthRepository(), () => new pg.PgIntegrationHealthRepository()),
  {
    provide: ports.CALLBACK_REPOSITORY,
    inject: [KERNEL_OPTIONS, FIELD_CIPHER],
    useFactory: (config: KernelConfig, cipher: FieldCipher) => config.persistence === 'pg'
      ? new pg.PgCallbackRepository(cipher) : new memory.InMemoryCallbackRepository(cipher),
  },
  {
    provide: ports.BREAKER_STATE_STORE,
    inject: [KERNEL_OPTIONS, PLATFORM_POOL],
    useFactory: (config: KernelConfig, pool?: Pool) => config.persistence === 'pg' && pool
      ? new pg.PgBreakerStateStore(pool) : new memory.InMemoryBreakerStateStore(),
  },
  {
    provide: ports.INTEGRATION_CALLBACK_READER,
    inject: [KERNEL_OPTIONS, ports.CALLBACK_REPOSITORY, FIELD_CIPHER, CLOCK, AUDIT_LOG],
    useFactory: (config: KernelConfig, callbacks: memory.InMemoryCallbackRepository, cipher: FieldCipher, clock: Clock, auditLog: AuditLog) => {
      const deps = {
        callbacks,
        cipher,
        clock,
        auditLog
      };
      return config.persistence === 'pg' ? new pg.PgIntegrationCallbackReader(deps) : new memory.InMemoryIntegrationCallbackReader(deps);
    },
  },
  {
    provide: ports.INTEGRATION_RECONCILIATION_READER,
    inject: [KERNEL_OPTIONS, ports.SUBMISSION_REPOSITORY, FIELD_CIPHER, AUDIT_LOG],
    useFactory: (config: KernelConfig, submissions: memory.InMemorySubmissionRepository, cipher: FieldCipher, auditLog: AuditLog) => {
      const deps = {
        submissions,
        cipher,
        auditLog
      };
      return config.persistence === 'pg' ? new pg.PgIntegrationReconciliationReader(deps) : new memory.InMemoryIntegrationReconciliationReader(deps);
    },
  },
];
@Module({
  imports: [TenancyModule, PartyModule],
  controllers: [IntegrationsController, CallbacksController],
  providers: [
    ...repositories,
    {
      provide: ports.ADAPTER_REGISTRY,
      useFactory: () => new RegisteredAdapters([new AssistedAdapter(), new FakeInsurerAdapter()])
    },
    {
      provide: ports.CREDENTIAL_VAULT,
      useClass: UnboundCredentialVault
    },
    {
      provide: ports.RANDOM_SOURCE,
      useValue: {
        next: () => Math.random()
      }
    },
    {
      provide: ports.INSURER_URL_ALLOWLIST,
      useValue: {}
    },
    {
      provide: ports.SANDBOX_CERTIFICATION_RUNNER,
      inject: [ports.ADAPTER_REGISTRY, FIELD_CIPHER, LOGGER],
      useFactory: (registry: ports.AdapterRegistry, cipher: FieldCipher, logger: Logger) => new SandboxRunner(registry, cipher, logger)
    },
    IntegrationRuntime, IntegrationContext, IntegrationResources, IntegrationWork, IntegrationExecutor, IntegrationRouting,
    SubmissionService, IntegrationGateway, DeadLetterWriter, DeadLetterService, CallbackService, CertificationService, IntegrationAdminService,
    ProbeJob, ReconciliationJob, RetentionJob,
    {
      provide: ports.INTEGRATION_GATEWAY,
      useExisting: IntegrationGateway
    },
  ],
  exports: [ports.INTEGRATION_GATEWAY, ports.INTEGRATION_CALLBACK_READER, ports.INTEGRATION_RECONCILIATION_READER,
    ports.PIN_REPOSITORY, ports.CERTIFICATION_REPOSITORY, ports.SUBMISSION_REPOSITORY, ports.DEAD_LETTER_REPOSITORY,
    ports.ENCRYPTED_PAYLOAD_REPOSITORY, ports.CALLBACK_REPOSITORY, ports.INTEGRATION_CALL_LOG, ports.INTEGRATION_HEALTH_REPOSITORY,
    ProbeJob, ReconciliationJob, RetentionJob],
})
export class IntegrationModule implements OnModuleInit {
  constructor(
    @Inject(PERMISSION_POLICY) private readonly permissions: RolePermissionMatrix,
    @Inject(ports.INSURER_URL_ALLOWLIST) private readonly allowlist: ports.InsurerUrlAllowlist,
  ) {}
  onModuleInit(): void {
    this.validateOrigins();
    for (const role of ['TENANT_ADMIN', 'OPS']) {
      this.permissions.grant(role, ['integration.read', 'integration.write']);
    }
  }

  private validateOrigins(): void {
    for (const origins of Object.values(this.allowlist)) {
      for (const origin of origins) {
        if (!this.validOrigin(origin)) throw new ValidationError('validation_failed', 'Invalid insurer URL allowlist');
      }
    }
  }

  private validOrigin(origin: string): boolean {
    try {
      const url = new URL(origin);
      return url.protocol === 'https:' && !url.username && !url.password && url.origin === origin;
    } catch {
      return false;
    }
  }
}
