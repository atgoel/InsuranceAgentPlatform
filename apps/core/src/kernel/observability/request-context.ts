import { AsyncLocalStorage } from 'async_hooks';
import { DebugBuffer } from './debug-buffer';
import { newTraceId, newSpanId } from './trace-context';

export interface DependencyTiming {
  count: number;
  ms: number;
  errors: number;
}

export interface RequestContextData {
  traceId: string;
  spanId: string;
  tenantId?: string;
  actor?: string;
  module?: string;
  /** Route template (e.g. /api/v1/leads/:id), set by RouteTemplateInterceptor once Nest has matched a handler. */
  route?: string;
  forceDebug: boolean;
  hasError: boolean;
  buffer: DebugBuffer;
  deps: Record<string, DependencyTiming>;
  startedAtMs: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

export class RequestContext {
  static run<T>(data: RequestContextData, fn: () => T): T {
    return asyncLocalStorage.run(data, fn);
  }

  static current(): RequestContextData | undefined {
    return asyncLocalStorage.getStore();
  }

  static patch(patch: Partial<Omit<RequestContextData, 'buffer' | 'deps'>>): void {
    const current = this.current();
    if (!current) return;

    if (patch.traceId !== undefined) current.traceId = patch.traceId;
    if (patch.spanId !== undefined) current.spanId = patch.spanId;
    if (patch.tenantId !== undefined) current.tenantId = patch.tenantId;
    if (patch.actor !== undefined) current.actor = patch.actor;
    if (patch.module !== undefined) current.module = patch.module;
    if (patch.route !== undefined) current.route = patch.route;
    if (patch.forceDebug !== undefined) current.forceDebug = patch.forceDebug;
    if (patch.hasError !== undefined) current.hasError = patch.hasError;
    if (patch.startedAtMs !== undefined) current.startedAtMs = patch.startedAtMs;
  }

  static create(init: {
    traceId?: string;
    startedAtMs: number;
    forceDebug?: boolean;
  }): RequestContextData {
    return {
      traceId: init.traceId || newTraceId(),
      spanId: newSpanId(),
      forceDebug: init.forceDebug ?? false,
      hasError: false,
      buffer: new DebugBuffer(),
      deps: {},
      startedAtMs: init.startedAtMs,
    };
  }
}
