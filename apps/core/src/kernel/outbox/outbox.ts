import { DomainEvent } from '../domain/domain-event';
import { Transaction } from '../persistence/unit-of-work';

/** Write side: called inside the same transaction as the state change (transactional outbox). */
export interface Outbox {
  add(tx: Transaction, event: DomainEvent): Promise<void>;
}

/** Read side used by the relay. */
export interface OutboxSource {
  fetchUnpublished(limit: number): Promise<DomainEvent[]>;
  markPublished(ids: string[]): Promise<void>;
  /** Returns the attempt count after incrementing. */
  markFailed(id: string, error: string): Promise<number>;
  countPending(): Promise<number>;
}

interface OutboxEntry {
  event: DomainEvent;
  published: boolean;
  attempts: number;
  lastError?: string;
}

/** In-memory adapter for unit/component tests and local demo (no transactional guarantee). */
export class InMemoryOutbox implements Outbox, OutboxSource {
  private readonly entries = new Map<string, OutboxEntry>();

  get events(): DomainEvent[] {
    return [...this.entries.values()].map((e) => e.event);
  }

  async add(_tx: Transaction, event: DomainEvent): Promise<void> {
    this.entries.set(event.id, { event, published: false, attempts: 0 });
  }

  async fetchUnpublished(limit: number): Promise<DomainEvent[]> {
    return this.pending().slice(0, limit);
  }

  async markPublished(ids: string[]): Promise<void> {
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) entry.published = true;
    }
  }

  async markFailed(id: string, error: string): Promise<number> {
    const entry = this.entries.get(id);
    if (!entry) return 0;
    entry.attempts += 1;
    entry.lastError = error;
    return entry.attempts;
  }

  async countPending(): Promise<number> {
    return this.pending().length;
  }

  published(): DomainEvent[] {
    return [...this.entries.values()].filter((e) => e.published).map((e) => e.event);
  }

  pending(): DomainEvent[] {
    return [...this.entries.values()].filter((e) => !e.published).map((e) => e.event);
  }
}

export type { EventBus, EventHandler } from './event-bus';
export { InProcessEventBus } from './event-bus';
export { OutboxRelay } from './outbox-relay';
export type { OutboxRelayDeps } from './outbox-relay';
export type { Inbox } from './inbox';
export { InMemoryInbox } from './inbox';
