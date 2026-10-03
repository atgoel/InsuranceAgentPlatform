import { Clock } from '../domain/clock';
import { MetricsRegistry } from './metrics';
import { RequestContext } from './request-context';

export class Tracer {
  constructor(private clock: Clock, private metrics: MetricsRegistry) {}

  async span<T>(
    name: string,
    fn: () => Promise<T>,
    opts?: { dep?: string; op?: string }
  ): Promise<T> {
    return this.track(name, this.clock.now().getTime(), fn, opts);
  }

  /** Current clock reading in ms; lets callers start timing before they invoke the work (see traced()). */
  nowMs(): number {
    return this.clock.now().getTime();
  }

  /** Completes a span whose work started at `start` (ms). */
  async track<T>(name: string, start: number, work: () => Promise<T>, opts?: { dep?: string; op?: string }): Promise<T> {
    let outcome: 'ok' | 'error' | 'timeout' = 'ok';

    try {
      return await work();
    } catch (error) {
      outcome = (error as Record<string, unknown>).code === 'timeout' ? 'timeout' : 'error';
      throw error;
    } finally {
      this.recordSpan(name, start, outcome, opts);
    }
  }

  private recordSpan(name: string, startMs: number, outcome: string, opts?: { dep?: string; op?: string }): void {
    const duration = this.clock.now().getTime() - startMs;
    const ctx = RequestContext.current();
    if (!ctx) return;

    ctx.buffer.add({
      t: duration,
      level: 'debug',
      event: 'span',
      msg: name,
      ctx: { ms: duration, outcome },
    });

    if (!opts?.dep) return;

    this.recordDependencyMetrics(ctx, {
      dep: opts.dep,
      op: opts.op,
      outcome,
      duration,
    });
  }

  private recordDependencyMetrics(
    ctx: ReturnType<typeof RequestContext.current>,
    depData: { dep: string; op?: string; outcome: string; duration: number }
  ): void {
    if (!ctx) return;

    this.updateContextDeps(ctx, depData.dep, depData.outcome, depData.duration);
    this.recordDependencyMetricsData(depData.dep, depData.op, depData.outcome, depData.duration);
  }

  private updateContextDeps(
    ctx: ReturnType<typeof RequestContext.current>,
    dep: string,
    outcome: string,
    duration: number
  ): void {
    if (!ctx) return;
    if (!ctx.deps[dep]) {
      ctx.deps[dep] = { count: 0, ms: 0, errors: 0 };
    }
    ctx.deps[dep].count++;
    ctx.deps[dep].ms += duration;
    if (outcome === 'error') {
      ctx.deps[dep].errors++;
    }
  }

  private recordDependencyMetricsData(
    dep: string,
    op: string | undefined,
    outcome: string,
    duration: number
  ): void {
    const opLabel = op ? { dep, op, outcome } : { outcome };
    this.metrics.counter('dependency_calls_total', 'Dependency calls', ['dep', 'op', 'outcome']).inc(opLabel);
    this.metrics.histogram('dependency_duration_ms', 'Dependency duration', ['dep', 'op']).observe(duration);
  }
}
