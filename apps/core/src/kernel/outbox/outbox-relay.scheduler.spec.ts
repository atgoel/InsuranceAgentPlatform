import { InMemoryOutbox, MAX_DELIVERY_ATTEMPTS } from './outbox';
import { InProcessEventBus } from './event-bus';
import { OutboxRelay } from './outbox-relay';
import { OutboxRelayScheduler } from './outbox-relay.scheduler';
import { MetricsRegistry } from '../observability/metrics';
import { Logger } from '../observability/logger';
import { KernelConfig } from '../config';
import { DomainEvent } from '../domain/domain-event';

const event = (id: string): DomainEvent => ({
  id,
  specVersion: '1.0',
  type: 'test.thing.happened',
  source: 'test',
  subject: 's',
  tenantId: 'ten_a',
  occurredAt: `2026-01-01T00:00:0${id.slice(-1)}.000Z`,
  dataVersion: 1,
  data: {},
});
const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as unknown as Logger;

describe('AC-M00-21 outbox dead-lettering', () => {
  it('AC-M00-21 an event that failed MAX_DELIVERY_ATTEMPTS times is never fetched again and does not block later events', async () => {
    const outbox = new InMemoryOutbox();
    await outbox.add({ tenantId: 'ten_a', kind: 'memory' as const }, event('evt_1'));
    await outbox.add({ tenantId: 'ten_a', kind: 'memory' as const }, event('evt_2'));
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i += 1) await outbox.markFailed('evt_1', 'boom');
    expect((await outbox.fetchUnpublished(1)).map((e) => e.id)).toEqual(['evt_2']);
    expect(await outbox.countPending()).toBe(1);
    expect(outbox.deadLettered().map((e) => e.id)).toEqual(['evt_1']);
  });

  it('AC-M00-21 the relay dead-letters after three failing passes and then stops retrying', async () => {
    const outbox = new InMemoryOutbox();
    const bus = new InProcessEventBus();
    let calls = 0;
    bus.subscribe(
      'test.thing.happened',
      async () => {
        calls += 1;
        throw new Error('subscriber down');
      },
      'test',
    );
    await outbox.add({ tenantId: 'ten_a', kind: 'memory' as const }, event('evt_1'));
    const relay = new OutboxRelay({ source: outbox, bus, logger, metrics: new MetricsRegistry() });
    const results = [await relay.relayOnce(), await relay.relayOnce(), await relay.relayOnce(), await relay.relayOnce()];
    expect(results.map((r) => [r.failed, r.deadLettered])).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 0],
    ]);
    expect(calls).toBe(3);
  });
});

describe('AC-M00-21 OutboxRelayScheduler', () => {
  const config = (env: KernelConfig['env']) => ({ env }) as KernelConfig;

  it('AC-M00-21 does not start a timer in the test environment', () => {
    const spy = jest.spyOn(global, 'setInterval');
    new OutboxRelayScheduler({ relayOnce: jest.fn() } as unknown as OutboxRelay, config('test'), logger).onApplicationBootstrap();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('AC-M00-21 starts an unref’d timer outside tests and clears it on shutdown', async () => {
    jest.useFakeTimers();
    const relayOnce = jest.fn().mockResolvedValue({ published: 0, failed: 0, deadLettered: 0 });
    const scheduler = new OutboxRelayScheduler({ relayOnce } as unknown as OutboxRelay, config('development'), logger);
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(3000);
    expect(relayOnce).toHaveBeenCalledTimes(3);
    scheduler.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(3000);
    expect(relayOnce).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('AC-M00-21 never overlaps passes and logs a failed pass', async () => {
    let release: () => void = () => undefined;
    const relayOnce = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            release = r;
          }),
      )
      .mockRejectedValueOnce(new Error('db down'));
    const scheduler = new OutboxRelayScheduler({ relayOnce } as unknown as OutboxRelay, config('test'), logger);
    const first = scheduler.tick();
    await scheduler.tick(); // skipped: the first pass is still running
    expect(relayOnce).toHaveBeenCalledTimes(1);
    release();
    await first;
    await scheduler.tick();
    expect(relayOnce).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('outbox.relay.failed', 'Outbox relay pass failed', expect.any(Error));
  });
});
