import { Logger } from './logger';
import { MemoryLogSink } from './log-sink';
import { Redactor } from './redactor';
import { ErrorDeduplicator } from './error-deduplicator';
import { LogOverrideStore } from './log-overrides';
import { FixedClock } from '../domain/clock';
import { SequentialIdGenerator } from '../domain/id-generator';
import { MetricsRegistry } from './metrics';
import { RequestContext } from './request-context';
import { ValidationError, BusinessRuleError } from '../errors/domain-errors';

describe('AC-M00-09/10/11/12 Logger rules (§4.8)', () => {
  let logger: Logger;
  let sink: MemoryLogSink;
  let clock: FixedClock;
  let dedup: ErrorDeduplicator;
  let overrides: LogOverrideStore;
  let metrics: MetricsRegistry;

  beforeEach(() => {
    sink = new MemoryLogSink();
    clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const redactor = new Redactor();
    dedup = new ErrorDeduplicator(clock, { maxPerWindow: 5 });
    overrides = new LogOverrideStore(clock, new SequentialIdGenerator());
    metrics = new MetricsRegistry();

    logger = new Logger({ sink, redactor, dedup, overrides, clock, metrics });
  });

  describe('(a) record stamped with context fields', () => {
    it('stamps ts, traceId, spanId, tenantId, actor from RequestContext', () => {
      const ctx = RequestContext.create({ startedAtMs: 0, traceId: 'trace_abc' });
      RequestContext.run(ctx, () => {
        RequestContext.patch({ tenantId: 'ten_123', actor: 'usr_456' });
        logger.info('test.event', 'Test message');

        expect(sink.records).toHaveLength(1);
        const record = sink.records[0];
        expect(record.ts).toBeDefined();
        expect(record.traceId).toBe('trace_abc');
        expect(record.spanId).toBe(ctx.spanId);
        expect(record.tenantId).toBe('ten_123');
        expect(record.actor).toBe('usr_456');
      });
    });

    it('stamps module from logger child({module})', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        const crmLogger = logger.child({ module: 'crm' });
        crmLogger.info('test.event', 'Test');

        expect(sink.records[0].module).toBe('crm');
      });
    });
  });

  describe('(b) ctx redacted', () => {
    it('redacts ctx object: phone masked, password [REDACTED]', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        logger.info('user.signup', 'New signup', {
          phone: '9876543210',
          password: 'secret123',
          name: 'Alice',
        });

        const record = sink.records[0];
        expect((record.ctx as Record<string, unknown>).phone).toContain('****');
        expect((record.ctx as Record<string, unknown>).password).toBe('[REDACTED]');
        expect((record.ctx as Record<string, unknown>).name).toBe('Alice');
      });
    });
  });

  describe('(c) debug inside context buffered, not written', () => {
    it('buffers DEBUG logs, not written to sink', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        logger.debug('test.debug', 'Debug message', { detail: 'data' });

        expect(sink.records).toHaveLength(0);
        expect(ctx.buffer.entries()).toHaveLength(1);
        expect(ctx.buffer.entries()[0].event).toBe('test.debug');
      });
    });
  });

  describe('(d) debug with forceDebug=true written with sampled forced', () => {
    it('writes debug with sampled: forced when forceDebug=true', () => {
      const ctx = RequestContext.create({ startedAtMs: 0, forceDebug: true });
      RequestContext.run(ctx, () => {
        logger.debug('test.debug', 'Forced debug');

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].sampled).toBe('forced');
      });
    });
  });

  describe('(e) debug written forced when override scope matches', () => {
    it('matches tenant and writes debug with sampled forced', () => {
      overrides.put({ scope: { tenantId: 'ten_123' }, ttlMinutes: 30, createdBy: 'op' });

      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        RequestContext.patch({ tenantId: 'ten_123' });
        logger.debug('test.debug', 'Via override');

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].sampled).toBe('forced');
      });
    });

    it('expires override after TTL', () => {
      overrides.put({ scope: { tenantId: 'ten_123' }, ttlMinutes: 1, createdBy: 'op' });

      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        RequestContext.patch({ tenantId: 'ten_123' });

        logger.debug('test.debug', 'Before expiry');
        expect(sink.records).toHaveLength(1);

        sink.clear();
        clock.advance(61000);

        logger.debug('test.debug', 'After expiry');
        expect(sink.records).toHaveLength(0); // Buffered only
        expect(ctx.buffer.entries()).toHaveLength(1);
      });
    });
  });

  describe('(f) debug with no context dropped', () => {
    it('drops debug logs outside context', () => {
      logger.debug('test.debug', 'Outside context');
      expect(sink.records).toHaveLength(0);
    });
  });

  describe('(g) info/warn written and appended to buffer', () => {
    it('info written to sink with sampled always', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        logger.info('test.info', 'Info message');

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].sampled).toBe('always');
      });
    });

    it('info appended to buffer', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        logger.info('test.info', 'Info message');

        expect(ctx.buffer.entries()).toHaveLength(1);
        expect(ctx.buffer.entries()[0].event).toBe('test.info');
      });
    });

    it('warn written to sink and appended to buffer', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        logger.warn('test.warn', 'Warning message');

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].level).toBe('warn');
        expect(ctx.buffer.entries()).toHaveLength(1);
      });
    });
  });

  describe('(h) error record structure', () => {
    it('records err.type, code, message, stack, fingerprint', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        const error = new ValidationError('field_error', 'Field is invalid');
        logger.error('test.error', 'Validation failed', error);

        expect(sink.records).toHaveLength(1);
        const errRecord = sink.records[0].err;
        expect(errRecord?.type).toBe('ValidationError');
        expect(errRecord?.code).toBe('field_error');
        expect(errRecord?.message).toBe('Field is invalid');
        expect(errRecord?.stack).toBeDefined();
        expect(errRecord?.fingerprint).toMatch(/^[0-9a-f]{12}$/);
      });
    });

    it('sets hasError=true on context', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        logger.error('test.error', 'Error', new Error('Test'));
        expect(ctx.hasError).toBe(true);
      });
    });
  });

  describe('(i) 6th identical error suppressed, increments counter', () => {
    it('logs first 5, suppresses 6th, increments errors_suppressed_total', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      const error = new Error('Same error');

      RequestContext.run(ctx, () => {
        for (let i = 0; i < 6; i++) {
          logger.error('test.error', 'Test', error);
        }

        expect(sink.records).toHaveLength(5); // 5 written
        const suppressed = metrics.counter('errors_suppressed_total', 'Errors suppressed');
        expect(suppressed.get()).toBeGreaterThan(0);
      });
    });

    it('window rollover: suppressedSinceLast reports previous window count', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      const error = new Error('Same error');

      RequestContext.run(ctx, () => {
        for (let i = 0; i < 7; i++) {
          logger.error('test.error', 'Test', error);
        }

        expect(sink.records).toHaveLength(5);

        sink.clear();
        clock.advance(61000); // Next window

        logger.error('test.error', 'Test', error);
        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].err?.suppressedSinceLast).toBe(2);
      });
    });
  });

  describe('(j) security() writes level warn, channel security', () => {
    it('writes security logs even outside context', () => {
      logger.security('security.access.denied', 'Unauthorized access', { ip: '192.168.1.1' });

      expect(sink.records).toHaveLength(1);
      const record = sink.records[0];
      expect(record.level).toBe('warn');
      expect(record.channel).toBe('security');
    });

    it('security logs are not deduped', () => {
      const error = new Error('Same error');

      for (let i = 0; i < 10; i++) {
        logger.security('security.event', 'Event', {});
      }

      expect(sink.records).toHaveLength(10); // All written, not deduped
    });
  });

  describe('(k) sink failure does not throw', () => {
    it('swallows write failures without throwing', () => {
      const badSink = {
        write: () => {
          throw new Error('Sink failure');
        },
      };
      const badLogger = new Logger({
        sink: badSink as MemoryLogSink,
        redactor: new Redactor(),
        dedup: new ErrorDeduplicator(clock),
        overrides: new LogOverrideStore(clock, new SequentialIdGenerator()),
        clock,
        metrics: new MetricsRegistry(),
      });

      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        expect(() => badLogger.info('test', 'msg')).not.toThrow();
      });
    });
  });

  describe('(l) writeCanonical stamps ts and redacts ctx', () => {
    it('stamps ts from clock', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        logger.writeCanonical({
          level: 'info',
          event: 'request.completed',
          msg: 'Request',
        });

        expect(sink.records[0].ts).toBeDefined();
        expect(sink.records[0].ts).toContain('2026-01-01');
      });
    });

    it('redacts ctx in canonical record', () => {
      const ctx = RequestContext.create({ startedAtMs: 0 });
      RequestContext.run(ctx, () => {
        logger.writeCanonical({
          level: 'info',
          event: 'request.completed',
          msg: 'Request',
          ctx: { phone: '9876543210', token: 'secret' },
        });

        const record = sink.records[0];
        expect((record.ctx as Record<string, unknown>).phone).toContain('****');
        expect((record.ctx as Record<string, unknown>).token).toBe('[REDACTED]');
      });
    });
  });
});
