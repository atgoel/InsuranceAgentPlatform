import { ModuleMetadata } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import {
  KernelConfig,
  CLOCK,
  LOG_SINK,
  METRICS,
} from '../../src/kernel/config';
import { MemoryLogSink } from '../../src/kernel/observability/log-sink';
import { FixedClock } from '../../src/kernel/domain/clock';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
import { KernelModule } from '../../src/kernel/kernel.module';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  logs: MemoryLogSink;
  metrics: MetricsRegistry;
  clock: FixedClock;
  config: KernelConfig;
  close(): Promise<void>;
}

/**
 * AC-M00-* (test support)
 * testConfig returns a KernelConfig with memory persistence, test secrets,
 * devAuth enabled, and static test tenants for acme, zen, sleepy.
 */
export function testConfig(overrides?: Partial<KernelConfig>): KernelConfig {
  return {
    env: 'test',
    port: 3000,
    persistence: 'memory',
    tokenSecret: 'test-secret-32-chars-minimum!!!1',
    actorPepper: 'test-pepper',
    shareTokenSecret: 'test-share-secret-32-chars-min!!1',
    debugTokenSecret: 'test-debug-secret-32-chars!!!1',
    devAuth: true,
    trustProxy: false,
    staticTenants: {
      'acme.iap.test': { tenantId: 'ten_acme', status: 'active' },
      'zen.iap.test': { tenantId: 'ten_zen', status: 'active' },
      'sleepy.iap.test': { tenantId: 'ten_sleepy', status: 'suspended' },
    },
    logSampleRates: {},
    ...overrides,
  };
}

function withOverrides(builder: TestingModuleBuilder, overrides: Array<{ token: symbol; value: unknown }> = []): TestingModuleBuilder {
  return overrides.reduce((b, o) => b.overrideProvider(o.token).useValue(o.value), builder);
}

/**
 * AC-M00-* (test support)
 * createTestApp returns a TestApp with an INestApplication, supertest http client,
 * MemoryLogSink for assertions, FixedClock for determinism, and MetricsRegistry.
 * Overrides LOG_SINK and CLOCK tokens automatically.
 */
export async function createTestApp(opts?: {
  imports?: ModuleMetadata['imports'];
  controllers?: ModuleMetadata['controllers'];
  providers?: ModuleMetadata['providers'];
  config?: Partial<KernelConfig>;
  /** Replaces providers by token (e.g. fixed custom-field definitions). */
  overrides?: Array<{ token: symbol; value: unknown }>;
}): Promise<TestApp> {
  const config = testConfig(opts?.config);
  const memoryLogSink = new MemoryLogSink();
  const fixedClock = new FixedClock();
  const metricsRegistry = new MetricsRegistry();

  const builder = Test.createTestingModule({
    imports: [KernelModule.forRoot(config), ...(opts?.imports ?? [])],
    controllers: opts?.controllers ?? [],
    providers: opts?.providers ?? [],
  });
  const moduleFixture: TestingModule = await withOverrides(builder, opts?.overrides)
    .overrideProvider(LOG_SINK)
    .useValue(memoryLogSink)
    .overrideProvider(CLOCK)
    .useValue(fixedClock)
    .overrideProvider(METRICS)
    .useValue(metricsRegistry)
    .compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  await app.init();

  return {
    app,
    http: request(app.getHttpServer()),
    logs: memoryLogSink,
    metrics: metricsRegistry,
    clock: fixedClock,
    config,
    close: () => app.close(),
  };
}
