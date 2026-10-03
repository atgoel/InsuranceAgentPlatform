import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { CLOCK, DEBUG_TOKENS, FLUSH_POLICY, HEAD_SAMPLER, LOGGER, METRICS } from '../tokens';
import { Clock } from '../domain/clock';
import { Logger } from './logger';
import { MetricsRegistry } from './metrics';
import { FlushPolicy, FlushReason } from './flush-policy';
import { HeadSampler } from './head-sampler';
import { DebugTokenService } from './debug-token';
import { RequestContext, RequestContextData } from './request-context';
import { formatTraceparent, parseTraceparent } from './trace-context';

const UNMATCHED = 'unmatched';

/**
 * Request lifecycle for observability (spec 02, M00 §4.13): continue or start a trace, buffer debug detail,
 * then on finish record RED metrics and emit one canonical line — with the debug buffer only when the
 * request failed, was slow, or debugging was explicitly enabled (tail-based sampling).
 */
@Injectable()
export class ObservabilityMiddleware implements NestMiddleware {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(METRICS) private readonly metrics: MetricsRegistry,
    @Inject(FLUSH_POLICY) private readonly flushPolicy: FlushPolicy,
    @Inject(HEAD_SAMPLER) private readonly headSampler: HeadSampler,
    @Inject(DEBUG_TOKENS) private readonly debugTokens: DebugTokenService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const ctx = RequestContext.create({ traceId: parseTraceparent(req.get('traceparent'))?.traceId, startedAtMs: this.nowMs() });
    res.setHeader('x-trace-id', ctx.traceId);
    res.setHeader('traceparent', formatTraceparent(ctx.traceId, ctx.spanId));
    res.on('finish', () => this.onFinish(req, res, ctx));
    RequestContext.run(ctx, next);
  }

  private onFinish(req: Request, res: Response, ctx: RequestContextData): void {
    const route = ctx.route ?? UNMATCHED;
    const status = res.statusCode;
    if (this.headSampler.decide(route, status) === 'exclude') return;
    const durationMs = this.nowMs() - ctx.startedAtMs;
    this.recordMetrics(route, req.method, status, durationMs);
    // Tenant is only known after the AuthGuard ran, so the debug token is checked here (M00 §4.13 step 4).
    const forced = ctx.forceDebug || this.debugTokens.verify(req.get('x-debug-token'), ctx.tenantId);
    const flushReason = this.flushPolicy.decide({ method: req.method, route, status, durationMs, forced, hasError: ctx.hasError });
    if (!flushReason && this.headSampler.decide(route, status) === 'skip') return;
    this.writeCanonicalLine(ctx, { route, method: req.method, status, durationMs }, flushReason);
  }

  private recordMetrics(route: string, method: string, status: number, durationMs: number): void {
    const statusClass = `${Math.floor(status / 100)}xx`;
    this.metrics.counter('http_requests_total', 'HTTP requests', ['route', 'method', 'status_class']).inc({ route, method, status_class: statusClass });
    this.metrics.histogram('http_request_duration_ms', 'HTTP request duration in ms', ['route', 'method']).observe(durationMs, { route, method });
  }

  private writeCanonicalLine(
    ctx: RequestContextData,
    req: { route: string; method: string; status: number; durationMs: number },
    flushReason: FlushReason | undefined,
  ): void {
    this.logger.writeCanonical({
      level: req.status >= 500 ? 'error' : 'info',
      event: 'request.completed',
      msg: 'Request completed',
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      tenantId: ctx.tenantId,
      actor: ctx.actor,
      ...req,
      deps: ctx.deps,
      sampled: flushReason ? 'tail' : 'head',
      flushReason,
      buffered: flushReason ? [...ctx.buffer.entries()] : undefined,
      bufferDropped: flushReason ? ctx.buffer.dropped : undefined,
    });
    if (flushReason) {
      this.metrics.counter('log_buffer_flushes_total', 'Debug buffer flushes', ['reason']).inc({ reason: flushReason });
    }
  }

  private nowMs(): number {
    return this.clock.now().getTime();
  }
}
