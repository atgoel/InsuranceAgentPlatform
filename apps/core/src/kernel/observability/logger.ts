import { LogRecord, LogLevel } from './log-record';
import { LogSink } from './log-sink';
import { Redactor } from './redactor';
import { ErrorDeduplicator } from './error-deduplicator';
import { LogOverrideStore, LogOverrideScope } from './log-overrides';
import { Clock } from '../domain/clock';
import { MetricsRegistry } from './metrics';
import { RequestContext } from './request-context';

export interface LoggerDeps {
  sink: LogSink;
  redactor: Redactor;
  dedup: ErrorDeduplicator;
  overrides: LogOverrideStore;
  clock: Clock;
  metrics?: MetricsRegistry;
}

/** Stack traces are capped to bound log volume; the top frames carry the diagnostic value. */
const MAX_STACK_LINES = 12;

export class Logger {
  private bindings: { module?: string };

  constructor(private deps: LoggerDeps, bindings?: { module?: string }) {
    this.bindings = bindings ?? {};
  }

  child(bindings: { module: string }): Logger {
    return new Logger(this.deps, bindings);
  }

  debug(event: string, msg: string, ctx?: Record<string, unknown>): void {
    const context = RequestContext.current();

    if (!context) {
      // No context, drop debug log
      return;
    }

    const scope: LogOverrideScope = {
      tenantId: context.tenantId,
      module: this.bindings.module,
      actor: context.actor,
    };

    const shouldLog =
      context.forceDebug || this.deps.overrides.isDebugEnabled(scope);

    const redactedCtx = ctx ? (this.deps.redactor.redact(ctx) as Record<string, unknown>) : undefined;

    if (shouldLog) {
      // Write to sink with forced sampling
      this.writeToSink({
        level: 'debug',
        event,
        msg,
        ctx: redactedCtx,
        sampled: 'forced',
      });
    } else {
      // Add to buffer
      context.buffer.add({
        t: this.deps.clock.now().getTime() - context.startedAtMs,
        level: 'debug',
        event,
        msg,
        ctx: redactedCtx,
      });
    }
  }

  info(event: string, msg: string, ctx?: Record<string, unknown>): void {
    const context = RequestContext.current();
    const redactedCtx = ctx ? (this.deps.redactor.redact(ctx) as Record<string, unknown>) : undefined;

    // Write to sink
    this.writeToSink({
      level: 'info',
      event,
      msg,
      ctx: redactedCtx,
      sampled: 'always',
    });

    // Also add to buffer if context exists
    if (context) {
      context.buffer.add({
        t: this.deps.clock.now().getTime() - context.startedAtMs,
        level: 'info',
        event,
        msg,
        ctx: redactedCtx,
      });
    }
  }

  warn(event: string, msg: string, ctx?: Record<string, unknown>): void {
    const context = RequestContext.current();
    const redactedCtx = ctx ? (this.deps.redactor.redact(ctx) as Record<string, unknown>) : undefined;

    // Write to sink
    this.writeToSink({
      level: 'warn',
      event,
      msg,
      ctx: redactedCtx,
      sampled: 'always',
    });

    // Also add to buffer if context exists
    if (context) {
      context.buffer.add({
        t: this.deps.clock.now().getTime() - context.startedAtMs,
        level: 'warn',
        event,
        msg,
        ctx: redactedCtx,
      });
    }
  }

  error(event: string, msg: string, error: unknown, ctx?: Record<string, unknown>): void {
    const context = RequestContext.current();
    if (context) {
      context.hasError = true;
    }

    const fingerprint = this.deps.dedup.fingerprint(error);
    const { log: shouldLog, suppressedSinceLast } = this.deps.dedup.admit(fingerprint);

    if (shouldLog) {
      this.logError({ event, msg, error, ctx, fingerprint, suppressedSinceLast });
    } else if (this.deps.metrics) {
      this.deps.metrics.counter('errors_suppressed_total', 'Suppressed errors').inc();
    }
  }

  private logError(errorData: {
    event: string;
    msg: string;
    error: unknown;
    ctx: Record<string, unknown> | undefined;
    fingerprint: string;
    suppressedSinceLast: number;
  }): void {
    const errorInfo = this.extractErrorInfo(
      errorData.error,
      errorData.fingerprint,
      errorData.suppressedSinceLast
    );
    const redactedCtx = errorData.ctx ? (this.deps.redactor.redact(errorData.ctx) as Record<string, unknown>) : undefined;

    this.writeToSink({
      level: 'error',
      event: errorData.event,
      msg: errorData.msg,
      ctx: redactedCtx,
      err: errorInfo,
    });
  }

  private extractErrorInfo(
    error: unknown,
    fingerprint: string,
    suppressedSinceLast: number
  ): LogRecord['err'] {
    const errorType = error instanceof Error ? error.constructor.name : typeof error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as Record<string, unknown>).code
        : undefined;

    return {
      type: errorType,
      code: typeof errorCode === 'string' ? errorCode : undefined,
      message: String(this.deps.redactor.redact(errorMessage)),
      stack: errorStack ? this.deps.redactor.scrub(errorStack.split('\n').slice(0, MAX_STACK_LINES).join('\n')) : undefined,
      fingerprint,
      suppressedSinceLast: suppressedSinceLast > 0 ? suppressedSinceLast : undefined,
    };
  }

  security(event: string, msg: string, ctx?: Record<string, unknown>): void {
    const redactedCtx = ctx ? (this.deps.redactor.redact(ctx) as Record<string, unknown>) : undefined;

    this.writeToSink({
      level: 'warn',
      event,
      msg,
      ctx: redactedCtx,
      channel: 'security',
    });
  }

  writeCanonical(record: Omit<LogRecord, 'ts'>): void {
    const fullRecord: LogRecord = {
      ...record,
      ts: this.deps.clock.now().toISOString(),
      ctx: record.ctx ? (this.deps.redactor.redact(record.ctx) as Record<string, unknown>) : record.ctx,
    };

    try {
      this.deps.sink.write(fullRecord);
    } catch {
      // Swallow sink failures
    }
  }

  private writeToSink(partial: Partial<LogRecord> & { level: LogLevel; event: string; msg: string }): void {
    const context = RequestContext.current();

    const record: LogRecord = {
      ...partial,
      ts: this.deps.clock.now().toISOString(),
      traceId: context?.traceId,
      spanId: context?.spanId,
      tenantId: context?.tenantId,
      actor: context?.actor,
      module: this.bindings.module,
    };

    try {
      this.deps.sink.write(record);
    } catch {
      // Swallow sink failures
    }
  }
}
