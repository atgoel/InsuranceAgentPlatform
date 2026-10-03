export interface Inbox {
  processOnce(consumer: string, eventId: string, fn: () => Promise<void>): Promise<boolean>;
}

export class InMemoryInbox implements Inbox {
  private readonly processed: Set<string> = new Set();

  async processOnce(consumer: string, eventId: string, fn: () => Promise<void>): Promise<boolean> {
    const key = `${consumer}:${eventId}`;
    if (this.processed.has(key)) {
      return false;
    }
    this.processed.add(key);
    await fn();
    return true;
  }
}
