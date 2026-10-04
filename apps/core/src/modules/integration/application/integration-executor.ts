import { Injectable } from '@nestjs/common';
import { Bulkhead } from '../domain/bulkhead';
import { CircuitBreaker } from '../domain/circuit-breaker';
import { RetryPolicy } from '../domain/retry-policy';
import { CallOutcome } from '../domain/outcome';
import { Operation, RouteKind } from '../domain/capability-manifest';
import { AdapterContext, BreakerSnapshot, InsurerAdapter } from './ports';
import { IntegrationContext } from './integration-context';
import { IntegrationResources } from './integration-resources';
type Call<T> = {
  tenantId: string;
  adapter: InsurerAdapter;
  operation: Operation;
  route: RouteKind;
  key: string;
  timeoutMs: number;
  invoke: (ctx: AdapterContext) => Promise<CallOutcome<T>>;
};
@Injectable()
export class IntegrationExecutor {
  private readonly bulkheads = new Map<string, Bulkhead>();
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly snapshots = new Map<string, BreakerSnapshot>();
  constructor(private readonly context: IntegrationContext, private readonly resources: IntegrationResources) { }
  state(adapter: InsurerAdapter, operation: Operation) {
    const state = this.breaker(adapter, operation).state();
    const snapshot = this.snapshot(adapter, operation);
    if (snapshot.state !== state && state === 'HALF_OPEN') {
      snapshot.halfOpenInFlight = 0;
      snapshot.halfOpenSuccesses = 0;
    }
    snapshot.state = state;
    return state;
  }
  async run<T>(call: Call<T>, retry = true): Promise<{
    outcome: CallOutcome<T>;
    attempts: number;
  }> {
    const policy = new RetryPolicy({
      maxAttempts: 3,
      baseMs: 200,
      capMs: 5000
    }, () => this.context.runtime.random.next());
    let outcome: CallOutcome<T> = {
      kind: 'unknown',
      reason: 'timeout'
    };
    for (let attempts = 1; attempts <= 3; attempts += 1) {
      outcome = await this.once(call);
      if (!retry || !policy.isRetryable(outcome) || attempts === 3)
        return {
          outcome,
          attempts
        };
      await new Promise<void>((resolve) => setTimeout(resolve, policy.delayFor(attempts)));
    }
    return {
      outcome,
      attempts: 3
    };
  }
  private async once<T>(call: Call<T>): Promise<CallOutcome<T>> {
    const started = this.context.runtime.clock.now().getTime();
    const breaker = this.breaker(call.adapter, call.operation);
    this.state(call.adapter, call.operation);
    if (!breaker.canPass())
      return this.unavailable();
    const snapshot = this.snapshot(call.adapter, call.operation);
    if (snapshot.state === 'HALF_OPEN')
      snapshot.halfOpenInFlight += 1;
    const outcome = await this.deadline(call);
    const latencyMs = Math.max(0, this.context.runtime.clock.now().getTime() - started);
    const sample = latencyMs >= (call.adapter.manifest().slaP95Ms ?? call.timeoutMs)
      ? 'slow' : outcome.kind === 'success' ? 'success' : 'failure';
    this.recordBreaker(call.adapter, call.operation, sample);
    await this.record(call, outcome, latencyMs);
    return outcome;
  }
  private deadline<T>(call: Call<T>): Promise<CallOutcome<T>> {
    return new Promise<CallOutcome<T>>((resolve) => {
      const controller = new AbortController();
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        controller.abort();
        resolve({
          kind: 'unknown',
          reason: 'timeout'
        });
      }, call.timeoutMs);
      const slot = this.bulkhead(call.adapter).run(async () => {
        if (expired)
          return;
        try {
          resolve(await call.invoke(this.adapterContext(call, controller.signal)));
        }
        catch {
          resolve(call.operation === 'SUBMIT_PROPOSAL'
            ? {
              kind: 'unknown',
              reason: 'connection_reset'
            } : {
            kind: 'failure',
              retryable: true,
              code: 'dependency_unavailable',
              message: 'Integration unavailable'
          });
        }
        finally {
          clearTimeout(timer);
        }
      });
      void slot.catch(() => {
        clearTimeout(timer);
        resolve(this.unavailable());
      });
    });
  }
  private adapterContext<T>(call: Call<T>, signal: AbortSignal): AdapterContext {
    return {
      tenantId: call.tenantId,
      idempotencyKey: call.key,
      credentials: () => this.resources.vault.resolve(call.tenantId, call.adapter.manifest().adapterId),
      signal,
      logger: this.context.runtime.logger.child({
        module: 'integration'
      }),
    };
  }
  private unavailable(): CallOutcome<never> {
    return {
      kind: 'failure',
      retryable: false,
      code: 'dependency_unavailable',
      message: 'Integration unavailable'
    };
  }
  private breaker(adapter: InsurerAdapter, operation: Operation): CircuitBreaker {
    const manifest = adapter.manifest();
    const key = `${manifest.adapterId}:${manifest.adapterVersion}:${operation}`;
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker({
        failureRateThreshold: 0.5,
        minimumCalls: 10,
        windowSize: 20,
        slowCallMs: manifest.slaP95Ms ?? 30000,
        openForMs: 30000,
        halfOpenProbes: 3,
      }, this.context.runtime.clock);
      this.breakers.set(key, breaker);
    }
    return breaker;
  }
  private bulkhead(adapter: InsurerAdapter): Bulkhead {
    const counterparty = adapter.manifest().counterparty;
    const key = `${counterparty.kind}:${counterparty.insurerId ?? counterparty.name}`;
    let bulkhead = this.bulkheads.get(key);
    if (!bulkhead) {
      bulkhead = new Bulkhead(10, 100);
      this.bulkheads.set(key, bulkhead);
    }
    return bulkhead;
  }
  private snapshot(adapter: InsurerAdapter, operation: Operation): BreakerSnapshot {
    const manifest = adapter.manifest();
    const key = `${manifest.adapterId}:${manifest.adapterVersion}:${operation}`;
    let snapshot = this.snapshots.get(key);
    if (!snapshot) {
      snapshot = {
        adapterId: manifest.adapterId,
        adapterVersion: manifest.adapterVersion,
        operation,
        state: 'CLOSED',
        samples: [],
        halfOpenInFlight: 0,
        halfOpenSuccesses: 0,
        version: 0,
      };
      this.snapshots.set(key, snapshot);
    }
    return snapshot;
  }
  private recordBreaker(adapter: InsurerAdapter, operation: Operation, sample: 'success' | 'failure' | 'slow') {
    const snapshot = this.snapshot(adapter, operation);
    const before = snapshot.state;
    if (before === 'CLOSED')
      snapshot.samples = [...snapshot.samples, sample].slice(-20);
    if (before === 'HALF_OPEN') {
      snapshot.halfOpenInFlight = Math.max(0, snapshot.halfOpenInFlight - 1);
      if (sample === 'success')
        snapshot.halfOpenSuccesses += 1;
    }
    this.breaker(adapter, operation).record(sample);
    snapshot.state = this.breaker(adapter, operation).state();
    if (snapshot.state === 'OPEN' && before !== 'OPEN')
      snapshot.openedAt = this.context.runtime.clock.now().toISOString();
    if (snapshot.state !== 'HALF_OPEN') {
      snapshot.halfOpenInFlight = 0;
      snapshot.halfOpenSuccesses = 0;
    }
    if (snapshot.state === 'CLOSED' && before === 'HALF_OPEN')
      snapshot.samples = [];
    snapshot.version += 1;
  }
  private async record<T>(call: Call<T>, outcome: CallOutcome<T>, latencyMs: number) {
    const { runtime } = this.context;
    const manifest = call.adapter.manifest();
    const labels = {
      adapter: manifest.adapterId,
      operation: call.operation
    };
    runtime.metrics.counter('integration_calls_total', 'Integration calls', ['adapter', 'operation', 'route', 'outcome'])
      .inc({
      ...labels,
        route: call.route,
        outcome: outcome.kind
    });
    runtime.metrics.histogram('integration_call_duration_ms', 'Integration latency', ['adapter', 'operation']).observe(latencyMs, labels);
    const state = this.state(call.adapter, call.operation);
    runtime.metrics.gauge('integration_breaker_state', 'Integration breaker', ['adapter', 'operation'])
      .set({
      CLOSED: 0,
        OPEN: 1,
        HALF_OPEN: 2
    }[state], labels);
    await this.resources.breakers.save(structuredClone(this.snapshot(call.adapter, call.operation)));
    await this.context.uow.run(call.tenantId, (tx) => this.resources.calls.record(tx, {
      id: runtime.ids.next('icall'),
      adapterId: manifest.adapterId,
      adapterVersion: manifest.adapterVersion,
      operation: call.operation,
      route: call.route,
      idempotencyKey: call.key,
      outcome: outcome.kind,
      latencyMs,
      at: runtime.clock.now().toISOString(),
      errorCode: outcome.kind === 'failure' ? outcome.code : undefined,
    }));
    runtime.logger.info('integration.call.completed', 'Integration call completed', {
      adapterId: manifest.adapterId,
      operation: call.operation,
      idempotencyKey: call.key,
      latencyMs,
      outcome: outcome.kind,
    });
  }
}
