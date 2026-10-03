import { DynamicModule, Global, MiddlewareConsumer, Module, NestModule, Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Pool } from 'pg';
import { KernelConfig } from './config';
import * as T from './tokens';
import { Clock, SystemClock } from './domain/clock';
import { IdGenerator, UlidIdGenerator } from './domain/id-generator';
import { Logger } from './observability/logger';
import { LogSink, MemoryLogSink } from './observability/log-sink';
import { Redactor } from './observability/redactor';
import { ErrorDeduplicator } from './observability/error-deduplicator';
import { LogOverrideStore } from './observability/log-overrides';
import { MetricsRegistry } from './observability/metrics';
import { Tracer } from './observability/tracer';
import { DebugTokenService } from './observability/debug-token';
import { FlushPolicy } from './observability/flush-policy';
import { HeadSampler } from './observability/head-sampler';
import { ObservabilityMiddleware } from './observability/observability.middleware';
import { TelemetryController } from './observability/telemetry.controller';
import { MetricsController } from './observability/metrics.controller';
import { HealthController } from './observability/health.controller';
import { LogOverridesController } from './observability/log-overrides.controller';
import { RouteTemplateInterceptor } from './observability/route-template.interceptor';
import { ProblemDetailsFilter } from './errors/problem-details.filter';
import { HmacJwtVerifier } from './tenancy/jwt';
import { DelegatingTenantResolver, StaticTenantResolver } from './tenancy/tenant-resolver';
import { DelegatingMfaPolicy, DelegatingPermissionPolicy, RolePermissionMatrix, StaticTenantPermissionPolicy } from './tenancy/permissions';
import { AuthGuard } from './tenancy/auth.guard';
import { PermissionGuard } from './tenancy/permission.guard';
import { MeController } from './tenancy/me.controller';
import { DevTokenController } from './tenancy/dev-token.controller';
import { InMemoryUnitOfWork } from './persistence/in-memory-unit-of-work';
import { PgUnitOfWork } from './persistence/pg-unit-of-work';
import { createPool } from './persistence/pg-pool';
import { InMemoryOutbox } from './outbox/outbox';
import { PgOutbox } from './outbox/pg-outbox';
import { InProcessEventBus } from './outbox/event-bus';
import { InMemoryInbox } from './outbox/inbox';
import { PgInbox } from './outbox/pg-inbox';
import { InMemoryAuditLog } from './audit/audit-log';
import { PgAuditLog } from './audit/pg-audit-log';
import { InMemoryIdempotencyStore } from './idempotency/idempotency-store';
import { PgIdempotencyStore } from './idempotency/pg-idempotency-store';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';

/** Observability, clock, ids and access control — identical in memory and pg modes. */
function coreProviders(config: KernelConfig): Provider[] {
  return [
    { provide: T.KERNEL_OPTIONS, useValue: config },
    { provide: T.CLOCK, useValue: new SystemClock() },
    { provide: T.ID_GENERATOR, useFactory: (clock: Clock) => new UlidIdGenerator(clock), inject: [T.CLOCK] },
    { provide: T.LOG_SINK, useFactory: (): LogSink => new MemoryLogSink() },
    { provide: T.METRICS, useValue: new MetricsRegistry() },
    { provide: T.REDACTOR, useValue: new Redactor() },
    { provide: T.TRACER, useFactory: (clock: Clock, m: MetricsRegistry) => new Tracer(clock, m), inject: [T.CLOCK, T.METRICS] },
    { provide: T.ERROR_DEDUPLICATOR, useFactory: (clock: Clock) => new ErrorDeduplicator(clock), inject: [T.CLOCK] },
    { provide: T.LOG_OVERRIDES, useFactory: (clock: Clock, ids: IdGenerator) => new LogOverrideStore(clock, ids), inject: [T.CLOCK, T.ID_GENERATOR] },
    {
      provide: T.LOGGER,
      // eslint-disable-next-line max-params
      useFactory: (sink: LogSink, redactor: Redactor, dedup: ErrorDeduplicator, overrides: LogOverrideStore, clock: Clock, metrics: MetricsRegistry) =>
        new Logger({ sink, redactor, dedup, overrides, clock, metrics }, { module: 'kernel' }),
      inject: [T.LOG_SINK, T.REDACTOR, T.ERROR_DEDUPLICATOR, T.LOG_OVERRIDES, T.CLOCK, T.METRICS],
    },
    { provide: T.DEBUG_TOKENS, useFactory: (clock: Clock) => new DebugTokenService(config.debugTokenSecret, clock), inject: [T.CLOCK] },
    { provide: T.FLUSH_POLICY, useValue: new FlushPolicy() },
    { provide: T.HEAD_SAMPLER, useValue: new HeadSampler({ rates: config.logSampleRates }) },
    { provide: T.TOKEN_VERIFIER, useFactory: (clock: Clock) => new HmacJwtVerifier(config.tokenSecret, clock), inject: [T.CLOCK] },
    { provide: T.TENANT_RESOLVER, useValue: new DelegatingTenantResolver(new StaticTenantResolver(config.staticTenants)) },
    { provide: T.PERMISSION_POLICY, useValue: new RolePermissionMatrix() },
    { provide: T.TENANT_PERMISSION_POLICY, useFactory: (m: RolePermissionMatrix) => new DelegatingPermissionPolicy(new StaticTenantPermissionPolicy(m)), inject: [T.PERMISSION_POLICY] },
    { provide: T.MFA_POLICY, useValue: new DelegatingMfaPolicy() },
    { provide: T.EVENT_BUS, useValue: new InProcessEventBus() },
    IdempotencyInterceptor,
  ];
}

function memoryPersistence(): Provider[] {
  return [
    { provide: T.APP_POOL, useValue: undefined },
    { provide: T.PLATFORM_POOL, useValue: undefined },
    { provide: T.UNIT_OF_WORK, useValue: new InMemoryUnitOfWork() },
    { provide: T.OUTBOX, useValue: new InMemoryOutbox() },
    { provide: T.INBOX, useValue: new InMemoryInbox() },
    { provide: T.AUDIT_LOG, useFactory: (c: Clock, i: IdGenerator, r: Redactor) => new InMemoryAuditLog(c, i, r), inject: [T.CLOCK, T.ID_GENERATOR, T.REDACTOR] },
    { provide: T.IDEMPOTENCY_STORE, useFactory: (c: Clock) => new InMemoryIdempotencyStore(c), inject: [T.CLOCK] },
  ];
}

function pgPersistence(config: KernelConfig): Provider[] {
  const appUrl = requireUrl(config.databaseUrl, 'DATABASE_URL');
  const platformUrl = config.platformDatabaseUrl ?? appUrl;
  return [
    { provide: T.APP_POOL, useFactory: () => createPool(appUrl) },
    { provide: T.PLATFORM_POOL, useFactory: () => createPool(platformUrl) },
    { provide: T.UNIT_OF_WORK, useFactory: (pool: Pool, tracer: Tracer) => new PgUnitOfWork(pool, tracer), inject: [T.APP_POOL, T.TRACER] },
    { provide: T.OUTBOX, useFactory: (platform: Pool) => new PgOutbox(platform), inject: [T.PLATFORM_POOL] },
    { provide: T.INBOX, useFactory: (platform: Pool) => new PgInbox(platform), inject: [T.PLATFORM_POOL] },
    { provide: T.AUDIT_LOG, useFactory: (c: Clock, i: IdGenerator, r: Redactor) => new PgAuditLog(c, i, r), inject: [T.CLOCK, T.ID_GENERATOR, T.REDACTOR] },
    { provide: T.IDEMPOTENCY_STORE, useFactory: (p: Pool, c: Clock) => new PgIdempotencyStore(p, c), inject: [T.APP_POOL, T.CLOCK] },
  ];
}

function requireUrl(url: string | undefined, name: string): string {
  if (!url) throw new Error(`${name} is required when PERSISTENCE=pg`);
  return url;
}

const EXPORTED = [
  T.KERNEL_OPTIONS, T.CLOCK, T.ID_GENERATOR, T.LOG_SINK, T.METRICS, T.REDACTOR, T.TRACER, T.ERROR_DEDUPLICATOR,
  T.LOG_OVERRIDES, T.LOGGER, T.DEBUG_TOKENS, T.FLUSH_POLICY, T.HEAD_SAMPLER, T.TOKEN_VERIFIER, T.TENANT_RESOLVER,
  T.PERMISSION_POLICY, T.TENANT_PERMISSION_POLICY, T.MFA_POLICY, T.EVENT_BUS, T.APP_POOL, T.PLATFORM_POOL, T.UNIT_OF_WORK, T.OUTBOX, T.INBOX, T.AUDIT_LOG,
  T.IDEMPOTENCY_STORE, IdempotencyInterceptor,
];

/**
 * Shared kernel composition root (spec M00 §11). Global so feature modules inject kernel ports by token.
 * Guards run in order: AuthGuard (tenant from trust) then PermissionGuard.
 */
@Global()
@Module({})
export class KernelModule implements NestModule {
  static forRoot(config: KernelConfig): DynamicModule {
    return {
      module: KernelModule,
      controllers: [HealthController, MetricsController, TelemetryController, LogOverridesController, MeController, DevTokenController],
      providers: [
        ...coreProviders(config),
        ...(config.persistence === 'pg' ? pgPersistence(config) : memoryPersistence()),
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
        { provide: APP_INTERCEPTOR, useClass: RouteTemplateInterceptor },
      ],
      exports: EXPORTED,
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ObservabilityMiddleware).forRoutes('*');
  }
}
