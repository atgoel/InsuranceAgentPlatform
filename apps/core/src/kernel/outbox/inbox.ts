/** Consumer-side deduplication: a consumer processes each event id at most once. */
export interface Inbox {
  /** Returns false (and does not run fn) when the event was already processed by this consumer. */
  processOnce(consumer: string, eventId: string, fn: () => Promise<void>): Promise<boolean>;
}

export class InMemoryInbox implements Inbox {
  private readonly processed = new Set<string>();

  async processOnce(consumer: string, eventId: string, fn: () => Promise<void>): Promise<boolean> {
    const key = `${consumer}:${eventId}`;
    if (this.processed.has(key)) return false;
    await fn();
    // Marked only after success so a failed handler is retried on redelivery.
    this.processed.add(key);
    return true;
  }
}
