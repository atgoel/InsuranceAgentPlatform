import { SystemClock } from '../domain/clock';
import { UlidIdGenerator } from '../domain/id-generator';
import { DomainEventFactory } from '../domain/domain-event';
import {
  InMemoryOutbox,
  InProcessEventBus,
  OutboxRelay,
} from './outbox';
import { MemoryLogSink } from '../observability/log-sink';
import { Redactor } from '../observability/redactor';
import { ErrorDeduplicator } from '../observability/error-deduplicator';
import { LogOverrideStore } from '../observability/log-overrides';
import { Logger } from '../observability/logger';
import { MetricsRegistry } from '../observability/metrics';

describe('outbox (AC-M00-21)', () => {
  const clock = new SystemClock();
  const ids = new UlidIdGenerator(clock);
  const eventFactory = new DomainEventFactory(clock, ids);

  describe('InMemoryOutbox', () => {
    it('stores events added to it', async () => {
      const outbox = new InMemoryOutbox();
      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: { name: 'John' },
      });

      await outbox.add({ tenantId: 'ten_acme', kind: 'memory' }, event);

      expect(outbox.pending()).toContain(event);
    });

    it('distinguishes between pending and published events', async () => {
      const outbox = new InMemoryOutbox();
      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: {},
      });

      await outbox.add({ tenantId: 'ten_acme', kind: 'memory' }, event);
      expect(outbox.published()).toHaveLength(0);
      expect(outbox.pending()).toHaveLength(1);

      await outbox.markPublished([event.id]);
      expect(outbox.published()).toHaveLength(1);
      expect(outbox.pending()).toHaveLength(0);
    });

    it('tracks failed events with error information', async () => {
      const outbox = new InMemoryOutbox();
      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: {},
      });

      await outbox.add({ tenantId: 'ten_acme', kind: 'memory' }, event);
      const attempts = await outbox.markFailed(event.id, 'Handler failed');

      expect(attempts).toBe(1);
    });
  });

  describe('InProcessEventBus', () => {
    it('publishes an event to a matching subscriber', async () => {
      const bus = new InProcessEventBus();
      const handler = jest.fn();

      bus.subscribe('crm.lead.created', handler, 'lead-logger');

      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: { name: 'John' },
      });

      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('publishes to wildcard subscribers', async () => {
      const bus = new InProcessEventBus();
      const handler = jest.fn();

      bus.subscribe('*', handler, 'universal-subscriber');

      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: {},
      });

      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('calls multiple handlers for the same event type sequentially', async () => {
      const bus = new InProcessEventBus();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      bus.subscribe('crm.lead.created', handler1, 'handler1');
      bus.subscribe('crm.lead.created', handler2, 'handler2');

      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: {},
      });

      await bus.publish(event);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('throws AggregateError if any handler fails', async () => {
      const bus = new InProcessEventBus();
      const handler1 = jest.fn();
      const handler2 = jest.fn().mockRejectedValue(new Error('Handler failed'));

      bus.subscribe('crm.lead.created', handler1, 'handler1');
      bus.subscribe('crm.lead.created', handler2, 'handler2');

      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: {},
      });

      await expect(bus.publish(event)).rejects.toThrow(AggregateError);
    });
  });

  describe('OutboxRelay', () => {
    it('publishes pending events and marks them as published', async () => {
      const source = new InMemoryOutbox();
      const bus = new InProcessEventBus();
      const logSink = new MemoryLogSink();
      const redactor = new Redactor();
      const dedup = new ErrorDeduplicator(clock);
      const overrides = new LogOverrideStore(clock, ids);
      const metrics = new MetricsRegistry();
      const logger = new Logger(
        { sink: logSink, redactor, dedup, overrides, clock, metrics },
        { module: 'kernel' },
      );

      const relay = new OutboxRelay({
        source,
        bus,
        logger,
        metrics,
        maxAttempts: 3,
      });

      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: {},
      });

      await source.add({ tenantId: 'ten_acme', kind: 'memory' }, event);

      const result = await relay.relayOnce(10);

      expect(result.published).toBe(1);
      expect(source.published()).toHaveLength(1);
    });

    it('retries failed events', async () => {
      const source = new InMemoryOutbox();
      const bus = new InProcessEventBus();
      let callCount = 0;
      const handler = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Temporary failure');
        }
      });

      bus.subscribe('crm.lead.created', handler, 'handler');

      const logSink = new MemoryLogSink();
      const redactor = new Redactor();
      const dedup = new ErrorDeduplicator(clock);
      const overrides = new LogOverrideStore(clock, ids);
      const metrics = new MetricsRegistry();
      const logger = new Logger(
        { sink: logSink, redactor, dedup, overrides, clock, metrics },
        { module: 'kernel' },
      );

      const relay = new OutboxRelay({
        source,
        bus,
        logger,
        metrics,
        maxAttempts: 3,
      });

      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: {},
      });

      await source.add({ tenantId: 'ten_acme', kind: 'memory' }, event);

      // First attempt fails
      const result1 = await relay.relayOnce(10);
      expect(result1.failed).toBe(1);

      // Second attempt succeeds
      const result2 = await relay.relayOnce(10);
      expect(result2.published).toBe(1);
    });

    it('dead-letters events after max attempts with error log', async () => {
      const source = new InMemoryOutbox();
      const bus = new InProcessEventBus();
      const handler = jest
        .fn()
        .mockRejectedValue(new Error('Permanent failure'));

      bus.subscribe('crm.lead.created', handler, 'handler');

      const logSink = new MemoryLogSink();
      const redactor = new Redactor();
      const dedup = new ErrorDeduplicator(clock);
      const overrides = new LogOverrideStore(clock, ids);
      const metrics = new MetricsRegistry();
      const logger = new Logger(
        { sink: logSink, redactor, dedup, overrides, clock, metrics },
        { module: 'kernel' },
      );

      const relay = new OutboxRelay({
        source,
        bus,
        logger,
        metrics,
        maxAttempts: 3,
      });

      const event = eventFactory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_001',
        tenantId: 'ten_acme',
        data: {},
      });

      await source.add({ tenantId: 'ten_acme', kind: 'memory' }, event);

      // Attempt 1
      await relay.relayOnce(10);
      // Attempt 2
      await relay.relayOnce(10);
      // Attempt 3
      const result = await relay.relayOnce(10);

      expect(result.deadLettered).toBe(1);

      // Verify error log was written
      const errorLogs = logSink.byEvent('outbox.event.dead_lettered');
      expect(errorLogs.length).toBeGreaterThan(0);
    });
  });
});
