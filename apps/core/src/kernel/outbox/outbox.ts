import { DomainEvent } from '../domain/domain-event';

export interface Transaction {
  readonly tenantId: string;
  readonly kind: 'memory' | 'pg';
}

export interface PgTransaction extends Transaction {
  readonly kind: 'pg';
  query<R = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number }>;
}

export interface Outbox {
  add(tx: Transaction, event: DomainEvent): Promise<void>;
}

export interface OutboxSource {
  fetchUnpublished(limit: number): Promise<DomainEvent[]>;
  markPublished(ids: string[]): Promise<void>;
  markFailed(id: string, error: string): Promise<number>; // returns attempts after increment
}

/**
 * AC-M00-21 (outbox): InMemoryOutbox
 * In-memory implementation of the outbox pattern.
 * Stores events and tracks their publication state.
 */
export class InMemoryOutbox implements Outbox, OutboxSource {
  private readonly eventMap: Map<string, DomainEvent> = new Map();
  private readonly metadata: Map<string, { published_at?: string; attempts: number; last_error?: string }> = new Map();
  private readonly publishedSet: Set<string> = new Set();

  async add(tx: Transaction, event: DomainEvent): Promise<void> {
    this.eventMap.set(event.id, event);
    this.metadata.set(event.id, { attempts: 0 });
  }

  async fetchUnpublished(limit: number): Promise<DomainEvent[]> {
    const unpublished: DomainEvent[] = [];
    for (const event of this.eventMap.values()) {
      if (!this.publishedSet.has(event.id) && unpublished.length < limit) {
        unpublished.push(event);
      }
    }
    return unpublished;
  }

  async markPublished(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.publishedSet.add(id);
      const meta = this.metadata.get(id);
      if (meta) {
        meta.published_at = new Date().toISOString();
      }
    }
  }

  async markFailed(id: string, error: string): Promise<number> {
    const meta = this.metadata.get(id);
    if (!meta) {
      return 0;
    }
    meta.attempts += 1;
    meta.last_error = error;
    return meta.attempts;
  }

  published(): DomainEvent[] {
    return Array.from(this.eventMap.values()).filter((e) => this.publishedSet.has(e.id));
  }

  pending(): DomainEvent[] {
    return Array.from(this.eventMap.values()).filter((e) => !this.publishedSet.has(e.id));
  }
}

export type EventHandler = (event: DomainEvent) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(type: string, handler: EventHandler, name: string): void;
}

/**
 * AC-M00-21 (outbox): InProcessEventBus
 * In-process event bus that calls matching handlers sequentially.
 * Throws AggregateError if any handler fails.
 */
export class InProcessEventBus implements EventBus {
  private readonly handlers: Map<string, { handler: EventHandler; name: string }[]> = new Map();

  subscribe(type: string, handler: EventHandler, name: string): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push({ handler, name });
  }

  async publish(event: DomainEvent): Promise<void> {
    const errors: Error[] = [];

    // Get matching handlers
    const exactHandlers = this.handlers.get(event.type) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];
    const allHandlers = [...exactHandlers, ...wildcardHandlers];

    // Call all handlers sequentially
    for (const { handler } of allHandlers) {
      try {
        await handler(event);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Throw AggregateError if any handler failed
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Event handlers failed');
    }
  }
}

export interface OutboxRelayDeps {
  source: OutboxSource;
  bus: EventBus;
  logger: any; // Logger type
  metrics: any; // MetricsRegistry type
  maxAttempts?: number;
}

/**
 * AC-M00-21 (outbox): OutboxRelay
 * Publishes unpublished events from the outbox to the event bus.
 * Retries failures and dead-letters after maxAttempts.
 */
export class OutboxRelay {
  private readonly maxAttempts: number;

  constructor(private readonly deps: OutboxRelayDeps) {
    this.maxAttempts = deps.maxAttempts ?? 3;
  }

  async relayOnce(limit: number = 100): Promise<{
    published: number;
    failed: number;
    deadLettered: number;
  }> {
    const events = await this.deps.source.fetchUnpublished(limit);
    let published = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const event of events) {
      try {
        await this.deps.bus.publish(event);
        await this.deps.source.markPublished([event.id]);
        published++;

        // Increment metrics
        this.deps.metrics.counter('domain_events_total', 'Domain events published', ['type']).inc({ type: event.type });
      } catch (error) {
        const attempts = await this.deps.source.markFailed(
          event.id,
          error instanceof Error ? error.message : String(error),
        );

        if (attempts >= this.maxAttempts) {
          deadLettered++;
          this.deps.logger.error(
            'outbox.event.dead_lettered',
            'Event dead-lettered after max attempts',
            error,
            { eventId: event.id, attempts },
          );
        } else {
          failed++;
        }
      }
    }

    // Update pending gauge
    const pending = await this.deps.source.fetchUnpublished(1);
    this.deps.metrics.gauge('outbox_pending', 'Pending outbox events').set(pending.length > 0 ? 1 : 0);

    return { published, failed, deadLettered };
  }
}

export interface Inbox {
  processOnce(consumer: string, eventId: string, fn: () => Promise<void>): Promise<boolean>;
}

/**
 * AC-M00-21 (outbox): InMemoryInbox
 * In-memory implementation of the inbox pattern.
 * Ensures a consumer processes each event at most once.
 */
export class InMemoryInbox implements Inbox {
  private readonly processed: Set<string> = new Set();

  async processOnce(consumer: string, eventId: string, fn: () => Promise<void>): Promise<boolean> {
    const key = `${consumer}:${eventId}`;
    if (this.processed.has(key)) {
      return false; // Already processed
    }
    this.processed.add(key);
    await fn();
    return true;
  }
}
