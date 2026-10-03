import { RequestContext, RequestContextData } from './request-context';

describe('AC-M00-07 RequestContext', () => {
  describe('create', () => {
    it('creates context with required fields', () => {
      const ctx = RequestContext.create({ startedAtMs: 1000 });

      expect(ctx.startedAtMs).toBe(1000);
      expect(ctx.traceId).toBeDefined();
      expect(ctx.spanId).toBeDefined();
      expect(ctx.buffer).toBeDefined();
      expect(ctx.deps).toEqual({});
    });

    it('generates traceId if not provided', () => {
      const ctx1 = RequestContext.create({ startedAtMs: 0 });
      const ctx2 = RequestContext.create({ startedAtMs: 0 });

      expect(ctx1.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(ctx2.traceId).toMatch(/^[0-9a-f]{32}$/);
      // Likely different unless very fast
    });

    it('accepts custom traceId', () => {
      const ctx = RequestContext.create({ startedAtMs: 0, traceId: 'custom_trace_id' });
      expect(ctx.traceId).toBe('custom_trace_id');
    });

    it('generates fresh spanId', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('initializes empty DebugBuffer', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      expect(ctx.buffer.entries()).toEqual([]);
      expect(ctx.buffer.dropped).toBe(0);
    });

    it('defaults forceDebug to false', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      expect(ctx.forceDebug).toBe(false);
    });

    it('accepts forceDebug', () => {
      const ctx = RequestContext.create({ startedAtMs: 0, forceDebug: true });
      expect(ctx.forceDebug).toBe(true);
    });
  });

  describe('run', () => {
    it('runs function inside context', () => {
      const ctx = RequestContext.create({ startedAtMs: 0, traceId: 'test_trace' });
      let capturedCtx: RequestContextData | undefined;

      RequestContext.run(ctx, () => {
        capturedCtx = RequestContext.current();
      });

      expect(capturedCtx).toBe(ctx);
    });

    it('returns function result', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      const result = RequestContext.run(ctx, () => 'test_value');

      expect(result).toBe('test_value');
    });

    it('isolates contexts', () => {
      const ctx1 = RequestContext.create({ startedAtMs: 0, traceId: 'trace_1' });
      const ctx2 = RequestContext.create({ startedAtMs: 0, traceId: 'trace_2' });

      const trace1 = RequestContext.run(ctx1, () => RequestContext.current()?.traceId);
      const trace2 = RequestContext.run(ctx2, () => RequestContext.current()?.traceId);

      expect(trace1).toBe('trace_1');
      expect(trace2).toBe('trace_2');
    });

    it('can be nested', () => {
      const ctx1 = RequestContext.create({ startedAtMs: 0, traceId: 'trace_1' });
      const ctx2 = RequestContext.create({ startedAtMs: 0, traceId: 'trace_2' });

      const result = RequestContext.run(ctx1, () => {
        const trace1 = RequestContext.current()?.traceId;
        return RequestContext.run(ctx2, () => {
          const trace2 = RequestContext.current()?.traceId;
          return { trace1, trace2 };
        });
      });

      expect(result.trace1).toBe('trace_1');
      expect(result.trace2).toBe('trace_2');
    });
  });

  describe('current', () => {
    it('returns context inside run', () => {
      const ctx = RequestContext.create({ startedAtMs: 100 });
      const found = RequestContext.run(ctx, () => RequestContext.current());

      expect(found).toBe(ctx);
    });

    it('returns undefined outside run', () => {
      const found = RequestContext.current();
      expect(found).toBeUndefined();
    });
  });

  describe('patch', () => {
    it('updates context fields inside run', () => {
      const ctx = RequestContext.create({ startedAtMs: 0, traceId: 'original' });

      RequestContext.run(ctx, () => {
        RequestContext.patch({ tenantId: 'ten_123' });
        const current = RequestContext.current();
        expect(current?.tenantId).toBe('ten_123');
      });
    });

    it('updates actor field', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });

      RequestContext.run(ctx, () => {
        RequestContext.patch({ actor: 'usr_123' });
        const current = RequestContext.current();
        expect(current?.actor).toBe('usr_123');
      });
    });

    it('updates module field', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });

      RequestContext.run(ctx, () => {
        RequestContext.patch({ module: 'crm' });
        const current = RequestContext.current();
        expect(current?.module).toBe('crm');
      });
    });

    it('updates multiple fields at once', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });

      RequestContext.run(ctx, () => {
        RequestContext.patch({
          tenantId: 'ten_123',
          actor: 'usr_456',
          module: 'payment',
        });
        const current = RequestContext.current();
        expect(current?.tenantId).toBe('ten_123');
        expect(current?.actor).toBe('usr_456');
        expect(current?.module).toBe('payment');
      });
    });

    it('is no-op outside context', () => {
      expect(() => {
        RequestContext.patch({ tenantId: 'ten_123' });
      }).not.toThrow();
    });

    it('cannot patch buffer or deps', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });

      RequestContext.run(ctx, () => {
        const originalBuffer = RequestContext.current()?.buffer;
        const originalDeps = RequestContext.current()?.deps;

        RequestContext.patch({
          tenantId: 'ten_123',
          // buffer and deps cannot be passed
        } as unknown);

        const current = RequestContext.current();
        expect(current?.buffer).toBe(originalBuffer);
        expect(current?.deps).toBe(originalDeps);
      });
    });
  });

  describe('deps tracking', () => {
    it('initializes empty deps', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      expect(ctx.deps).toEqual({});
    });

    it('allows deps to be updated', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });

      RequestContext.run(ctx, () => {
        const current = RequestContext.current();
        if (current) {
          current.deps.pg = { count: 1, ms: 50, errors: 0 };
        }
        const updated = RequestContext.current();
        expect(updated?.deps.pg).toEqual({ count: 1, ms: 50, errors: 0 });
      });
    });
  });

  describe('hasError flag', () => {
    it('defaults to false', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      expect(ctx.hasError).toBe(false);
    });

    it('can be set via patch', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });

      RequestContext.run(ctx, () => {
        RequestContext.patch({ hasError: true });
        expect(RequestContext.current()?.hasError).toBe(true);
      });
    });
  });
});
