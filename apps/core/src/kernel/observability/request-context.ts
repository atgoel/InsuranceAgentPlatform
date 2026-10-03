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

    const keys: (keyof typeof patch)[] = ['traceId', 'spanId', 'tenantId', 'actor', 'module', 'route', 'forceDebug', 'hasError', 'startedAtMs'];
    for (const key of keys) {
      if (patch[key] !== undefined) {
        (current as unknown as Record<string, unknown>)[key] = patch[key];
      }
    }
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
