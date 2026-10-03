import { traced } from './traced';
import { Tracer } from './tracer';
import { FixedClock } from '../domain/clock';
import { MetricsRegistry } from './metrics';
import { RequestContext } from './request-context';

describe('AC-M00-15 traced()', () => {
  interface Repository {
    findById(id: string): Promise<Record<string, unknown>>;
    save(obj: Record<string, unknown>): Promise<void>;
    search(query: string): Record<string, unknown>[];
    name?: string;
  }

  const repo: Repository = {
    findById: async (id) => ({ id, name: 'Test' }),
    save: async () => {},
    search: (query) => [{ query, result: 'test' }],
  };

  it('wraps async methods', async () => {
    const clock = new FixedClock();
    const metrics = new MetricsRegistry();
    const tracer = new Tracer(clock, metrics);
    const ctx = RequestContext.create({ startedAtMs: 0 });

    const wrapped = traced(repo, 'db', tracer);

    await RequestContext.run(ctx, async () => {
      const result = await wrapped.findById('123');
      expect(result?.id).toBe('123');
      expect(ctx.deps.db).toBeDefined();
    });
  });

  it('records dependency count and duration in context', async () => {
    const clock = new FixedClock();
    const metrics = new MetricsRegistry();
    const tracer = new Tracer(clock, metrics);
    const ctx = RequestContext.create({ startedAtMs: 0 });

    const slowRepo = { findById: async (id: string) => { clock.advance(50); return { id }; } };
    const slow = traced(slowRepo, 'db', tracer);
    await RequestContext.run(ctx, async () => {
      await slow.findById('123');

      expect(ctx.deps.db?.count).toBe(1);
      expect(ctx.deps.db?.ms).toBeGreaterThanOrEqual(50);
      expect(ctx.deps.db?.errors).toBe(0);
    });
  });

  it('records dependency_calls_total metric', async () => {
    const clock = new FixedClock();
    const metrics = new MetricsRegistry();
    const tracer = new Tracer(clock, metrics);
    const ctx = RequestContext.create({ startedAtMs: 0 });

    const wrapped = traced(repo, 'db', tracer);

    await RequestContext.run(ctx, async () => {
      await wrapped.findById('123');
      const counter = metrics.counter('dependency_calls_total', '');
      expect(counter.get({ dep: 'db', op: 'findById', outcome: 'ok' })).toBe(1);
    });
  });

  it('throwing method rethrows same error', async () => {
    const clock = new FixedClock();
    const metrics = new MetricsRegistry();
    const tracer = new Tracer(clock, metrics);
    const ctx = RequestContext.create({ startedAtMs: 0 });

    const failingRepo: Repository = {
      findById: async () => {
        throw new Error('DB connection failed');
      },
      save: async () => {},
      search: () => [],
    };

    const wrapped = traced(failingRepo, 'db', tracer);

    await RequestContext.run(ctx, async () => {
      await expect(wrapped.findById('123')).rejects.toThrow('DB connection failed');
    });
  });

  it('records outcome error when method throws', async () => {
    const clock = new FixedClock();
    const metrics = new MetricsRegistry();
    const tracer = new Tracer(clock, metrics);
    const ctx = RequestContext.create({ startedAtMs: 0 });

    const failingRepo: Repository = {
      findById: async () => {
        throw new Error('Failed');
      },
      save: async () => {},
      search: () => [],
    };

    const wrapped = traced(failingRepo, 'db', tracer);

    await RequestContext.run(ctx, async () => {
      try {
        await wrapped.findById('123');
      } catch {
        // error expected
      }

      expect(ctx.deps.db?.errors).toBe(1);
    });
  });

  it('sync methods pass through untouched', () => {
    const clock = new FixedClock();
    const metrics = new MetricsRegistry();
    const tracer = new Tracer(clock, metrics);
    const ctx = RequestContext.create({ startedAtMs: 0 });

    const wrapped = traced(repo, 'db', tracer);

    RequestContext.run(ctx, () => {
      const result = wrapped.search('test');
      expect(result).toEqual([{ query: 'test', result: 'test' }]);
      // Sync calls should not be traced
      expect(ctx.deps.db?.count).toBeUndefined();
    });
  });

  it('non-function properties pass through', () => {
    const clock = new FixedClock();
    const metrics = new MetricsRegistry();
    const tracer = new Tracer(clock, metrics);

    const repoWithProp: Repository & { version: string } = {
      version: '1.0.0',
      findById: async (id) => ({ id }),
      save: async () => {},
      search: () => [],
    };

    const wrapped = traced(repoWithProp, 'db', tracer);
    expect(wrapped.version).toBe('1.0.0');
  });
});
