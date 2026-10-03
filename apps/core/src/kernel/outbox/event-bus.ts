import { DomainEvent } from '../domain/domain-event';

export type EventHandler = (event: DomainEvent) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  /** `type` is an exact event type or '*' for every event. */
  subscribe(type: string, handler: EventHandler, name: string): void;
}

interface Subscription {
  handler: EventHandler;
  name: string;
}

/** Observer: in-process fan-out. Every matching handler runs even if an earlier one fails. */
export class InProcessEventBus implements EventBus {
  private readonly subscriptions = new Map<string, Subscription[]>();

  subscribe(type: string, handler: EventHandler, name: string): void {
    const list = this.subscriptions.get(type) ?? [];
    list.push({ handler, name });
    this.subscriptions.set(type, list);
  }

  async publish(event: DomainEvent): Promise<void> {
    const matching = [...(this.subscriptions.get(event.type) ?? []), ...(this.subscriptions.get('*') ?? [])];
    const errors: Error[] = [];
    for (const { handler } of matching) {
      try {
        await handler(event);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, `${errors.length} event handler(s) failed for ${event.type}`);
  }
}
