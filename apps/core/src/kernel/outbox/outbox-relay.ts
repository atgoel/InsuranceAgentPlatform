import { DomainEvent } from '../domain/domain-event';
import { Logger } from '../observability/logger';
import { MetricsRegistry } from '../observability/metrics';
import { EventBus } from './event-bus';
import { OutboxSource } from './outbox';

export interface OutboxRelayDeps {
  source: OutboxSource;
  bus: EventBus;
  logger: Logger;
  metrics: MetricsRegistry;
  maxAttempts?: number;
}

export interface RelayResult {
  published: number;
  failed: number;
  deadLettered: number;
}

/** Moves committed outbox events to subscribers; at-least-once delivery, consumers dedupe via the Inbox. */
export class OutboxRelay {
  private readonly maxAttempts: number;

  constructor(private readonly deps: OutboxRelayDeps) {
    this.maxAttempts = deps.maxAttempts ?? 3;
  }

  async relayOnce(limit = 100): Promise<RelayResult> {
    const result: RelayResult = { published: 0, failed: 0, deadLettered: 0 };
    for (const event of await this.deps.source.fetchUnpublished(limit)) {
      await this.relayEvent(event, result);
    }
    this.deps.metrics.gauge('outbox_pending', 'Unpublished outbox events').set(await this.deps.source.countPending());
    return result;
  }

  private async relayEvent(event: DomainEvent, result: RelayResult): Promise<void> {
    try {
      await this.deps.bus.publish(event);
      await this.deps.source.markPublished([event.id]);
      result.published += 1;
      this.deps.metrics.counter('domain_events_total', 'Domain events published', ['type']).inc({ type: event.type });
    } catch (error) {
      const attempts = await this.deps.source.markFailed(event.id, error instanceof Error ? error.message : String(error));
      if (attempts >= this.maxAttempts) {
        result.deadLettered += 1;
        this.deps.logger.error('outbox.event.dead_lettered', 'Outbox event dead-lettered', error, { eventId: event.id, type: event.type, attempts });
      } else {
        result.failed += 1;
        this.deps.logger.warn('outbox.event.retry_scheduled', 'Outbox event publish failed; will retry', { eventId: event.id, type: event.type, attempts });
      }
    }
  }
}
