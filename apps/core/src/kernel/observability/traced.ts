import { Tracer } from './tracer';

/**
 * Decorator (via Proxy): every method returning a Promise becomes a span + dependency metric.
 * Timing starts before the method is invoked so the span covers the real work.
 */
export function traced<T extends object>(target: T, dep: string, tracer: Tracer): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop);
      if (typeof value !== 'function') return value;
      return function (this: unknown, ...args: unknown[]) {
        const startedAt = tracer.nowMs();
        const result: unknown = value.apply(obj, args);
        if (!(result instanceof Promise)) return result;
        return tracer.track(`${dep}.${String(prop)}`, startedAt, () => result, { dep, op: String(prop) });
      };
    },
  });
}
