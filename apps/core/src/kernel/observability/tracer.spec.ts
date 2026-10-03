import { Tracer } from './tracer';
import { FixedClock } from '../domain/clock';
import { MetricsRegistry } from './metrics';
import { RequestContext } from './request-context';

describe('AC-M00-15 Tracer', () => {
  let tracer: Tracer;
  let clock: FixedClock;
  let metrics: MetricsRegistry;

  beforeEach(() => {
    clock = new FixedClock();
    metrics = new MetricsRegistry();
    tracer = new Tracer(clock, metrics);
  });

  it('records span duration', async () => {
    const ctx = RequestContext.create({ startedAtMs: 0 });
    await RequestContext.run(ctx, async () => {
      await tracer.span('test', async () => {
        clock.advance(100);
      });
      const entry = ctx.buffer.entries()[0];
      expect(entry.ctx?.ms).toBeGreaterThanOrEqual(100);
    });
  });

  it('records outcome ok', async () => {
    const ctx = RequestContext.create({ startedAtMs: 0 });
    await RequestContext.run(ctx, async () => {
      await tracer.span('test', async () => { return; });
      const entry = ctx.buffer.entries()[0];
      expect(entry.ctx?.outcome).toBe('ok');
    });
  });

  it('records outcome error', async () => {
    const ctx = RequestContext.create({ startedAtMs: 0 });
    await RequestContext.run(ctx, async () => {
      try {
        await tracer.span('test', async () => {
          throw new Error('test error');
        });
      } catch {
        // error expected
      }
      const entry = ctx.buffer.entries()[0];
      expect(entry.ctx?.outcome).toBe('error');
    });
  });

  it('rethrows errors', async () => {
    await expect(tracer.span('test', async () => {
      throw new Error('test');
    })).rejects.toThrow('test');
  });
});
