import { Global, Module, APP_GUARD, APP_FILTER, DynamicModule } from '@nestjs/common';
import { KernelConfig } from './config';
import * as tokens from './tokens';

// Domain
import { SystemClock, FixedClock } from './domain/clock';
import { UlidIdGenerator } from './domain/id-generator';

// Observability (from implementer #1)
import { Logger } from './observability/logger';
import { MemoryLogSink } from './observability/log-sink';
import { PinoLogSink } from './observability/log-sink';
import { Redactor } from './observability/redactor';
import { ErrorDeduplicator } from './observability/error-deduplicator';
import { LogOverrideStore } from './observability/log-overrides';
import { MetricsRegistry } from './observability/metrics';
import { Tracer } from './observability/tracer';
import { DebugTokenService } from './observability/debug-token';

// Errors (from implementer #1)
import { ProblemDetailsFilter } from './errors/problem-details.filter';

// Tenancy
import { HmacJwtVerifier } from './tenancy/jwt';
import { StaticTenantResolver } from './tenancy/tenant-resolver';
import { RolePermissionMatrix } from './tenancy/permissions';
import { AuthGuard } from './tenancy/auth.guard';
import { PermissionGuard } from './tenancy/permission.guard';
import { MeController } from './tenancy/me.controller';
import { DevTokenController } from './tenancy/dev-token.controller';

// Persistence
import { InMemoryUnitOfWork, PgUnitOfWork, createPool } from './persistence/unit-of-work';

// Outbox
import { InMemoryOutbox, InProcessEventBus, InMemoryInbox } from './outbox/outbox';

// Audit
import { InMemoryAuditLog } from './audit/audit-log';

// Idempotency
import { InMemoryIdempotencyStore } from './idempotency/idempotency-store';

@Global()
@Module({})
export class KernelModule {
  static forRoot(config: KernelConfig): DynamicModule {
    return {
      module: KernelModule,
      controllers: [MeController, DevTokenController],
      providers: [
        {
          provide: 'KernelConfig',
          useValue: config,
        },
        {
          provide: tokens.KERNEL_OPTIONS,
          useValue: config,
        },
        {
          provide: tokens.CLOCK,
          useFactory: () => {
            if (config.env === 'test') {
              return new FixedClock();
            }
            return new SystemClock();
          },
        },
        {
          provide: tokens.ID_GENERATOR,
          useFactory: (clock: any) => new UlidIdGenerator(clock),
          inject: [tokens.CLOCK],
        },
        {
          provide: tokens.LOG_SINK,
          useFactory: () => {
            if (config.env === 'test') {
              return new MemoryLogSink();
            }
            return new PinoLogSink();
          },
        },
        {
          provide: tokens.METRICS,
          useFactory: () => new MetricsRegistry(),
        },
        {
          provide: tokens.TRACER,
          useFactory: (clock: any, metrics: any) => new Tracer(clock, metrics),
          inject: [tokens.CLOCK, tokens.METRICS],
        },
        {
          provide: 'Redactor',
          useFactory: () => new Redactor(),
        },
        {
          provide: 'ErrorDeduplicator',
          useFactory: (clock: any) => new ErrorDeduplicator(clock),
          inject: [tokens.CLOCK],
        },
        {
          provide: tokens.LOG_OVERRIDES,
          useFactory: (clock: any, ids: any) => new LogOverrideStore(clock, ids),
          inject: [tokens.CLOCK, tokens.ID_GENERATOR],
        },
        {
          provide: tokens.LOGGER,
          useFactory: (
            logSink: any,
            redactor: any,
            dedup: any,
            overrides: any,
            clock: any,
            metrics: any,
          ) =>
            new Logger(
              { sink: logSink, redactor, dedup, overrides, clock, metrics },
              { module: 'kernel' },
            ),
          inject: [
            tokens.LOG_SINK,
            'Redactor',
            'ErrorDeduplicator',
            tokens.LOG_OVERRIDES,
            tokens.CLOCK,
            tokens.METRICS,
          ],
        },
        {
          provide: tokens.DEBUG_TOKENS,
          useFactory: (clock: any) => new DebugTokenService(config.debugTokenSecret, clock),
          inject: [tokens.CLOCK],
        },
        {
          provide: tokens.TOKEN_VERIFIER,
          useFactory: (clock: any) => new HmacJwtVerifier(config.tokenSecret, clock),
          inject: [tokens.CLOCK],
        },
        {
          provide: tokens.TENANT_RESOLVER,
          useFactory: () => new StaticTenantResolver(config.staticTenants),
        },
        {
          provide: tokens.PERMISSION_POLICY,
          useFactory: () => new RolePermissionMatrix(),
        },
        {
          provide: tokens.UNIT_OF_WORK,
          useFactory: (tracer: any) => {
            if (config.persistence === 'memory') {
              return new InMemoryUnitOfWork();
            }
            const pool = createPool(config.databaseUrl!);
            return new PgUnitOfWork(pool, tracer);
          },
          inject: [tokens.TRACER],
        },
        {
          provide: tokens.OUTBOX,
          useFactory: () => new InMemoryOutbox(),
        },
        {
          provide: tokens.EVENT_BUS,
          useFactory: () => new InProcessEventBus(),
        },
        {
          provide: tokens.INBOX,
          useFactory: () => new InMemoryInbox(),
        },
        {
          provide: tokens.AUDIT_LOG,
          useFactory: (clock: any, ids: any, redactor: any) =>
            new InMemoryAuditLog(clock, ids, redactor),
          inject: [tokens.CLOCK, tokens.ID_GENERATOR, 'Redactor'],
        },
        {
          provide: tokens.IDEMPOTENCY_STORE,
          useFactory: (clock: any) => new InMemoryIdempotencyStore(clock),
          inject: [tokens.CLOCK],
        },
        {
          provide: APP_FILTER,
          useClass: ProblemDetailsFilter,
        },
        {
          provide: APP_GUARD,
          useClass: AuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: PermissionGuard,
        },
      ],
      exports: [
        tokens.CLOCK,
        tokens.ID_GENERATOR,
        tokens.LOGGER,
        tokens.LOG_SINK,
        tokens.METRICS,
        tokens.TRACER,
        tokens.UNIT_OF_WORK,
        tokens.OUTBOX,
        tokens.EVENT_BUS,
        tokens.INBOX,
        tokens.AUDIT_LOG,
        tokens.IDEMPOTENCY_STORE,
        tokens.TOKEN_VERIFIER,
        tokens.TENANT_RESOLVER,
        tokens.PERMISSION_POLICY,
        tokens.LOG_OVERRIDES,
        tokens.DEBUG_TOKENS,
        tokens.KERNEL_OPTIONS,
      ],
    };
  }
}
