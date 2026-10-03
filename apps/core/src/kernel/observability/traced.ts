import { Tracer } from './tracer';

export function traced<T extends object>(target: T, dep: string, tracer: Tracer): T {
  return new Proxy(target, {
    get(target, prop) {
      const value = Reflect.get(target, prop);

      // Only wrap async functions
      if (typeof value === 'function') {
        return function (...args: unknown[]) {
          const result = value.apply(target, args);

          // Check if result is a Promise
          if (result instanceof Promise) {
            return tracer.span(`${dep}.${String(prop)}`, () => result, {
              dep,
              op: String(prop),
            });
          }

          return result;
        };
      }

      return value;
    },
  });
}
