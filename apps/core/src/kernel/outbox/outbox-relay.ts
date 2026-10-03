import { DomainEvent } from '../domain/domain-event';
import { EventBus } from './event-bus';

export interface OutboxSource {
  fetchUnpublished(limit: number): Promise<DomainEvent[]>;
  markPublished(ids: string[]): Promise<void>;
  markFailed(id: string, error: string): Promise<number>;
}

export class OutboxRelay {
  constructor(private readonly deps: {
    source: OutboxSource;
    bus: EventBus;
    logger: any;
    metrics: any;
    maxAttempts?: number;
  }) {}

  async relayOnce(limit: number = 100) {
    const events = await this.deps.source.fetchUnpublished(limit);
    let published = 0, failed = 0, deadLettered = 0;

    for (const event of events) {
      try {
        await this.deps.bus.publish(event);
        await this.deps.source.markPublished([event.id]);
        published++;
        this.deps.metrics.counter('domain_events_total', '', ['type']).inc({ type: event.type });
      } catch (error) {
        const attempts = await this.deps.source.markFailed(event.id, error instanceof Error ? error.message : String(error));
        if (attempts >= (this.deps.maxAttempts ?? 3)) {
          deadLettered++;
          this.deps.logger.error('outbox.event.dead_lettered', 'Event dead-lettered', error);
        } else {
          failed++;
        }
      }
    }

    this.deps.metrics.gauge('outbox_pending', '').set((await this.deps.source.fetchUnpublished(1)).length > 0 ? 1 : 0);
    return { published, failed, deadLettered };
  }
}
