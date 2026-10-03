import { DomainEvent } from '../domain/domain-event';

export type EventHandler = (event: DomainEvent) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(type: string, handler: EventHandler, name: string): void;
}

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
    const exactHandlers = this.handlers.get(event.type) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];
    const allHandlers = [...exactHandlers, ...wildcardHandlers];

    for (const { handler } of allHandlers) {
      try {
        await handler(event);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Event handlers failed');
    }
  }
}
