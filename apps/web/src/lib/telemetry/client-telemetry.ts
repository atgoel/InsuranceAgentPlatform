/**
 * Client telemetry event types from backend
 */
export type ClientEventKind = 'error' | 'vital';

export interface ClientEvent {
  kind: ClientEventKind;
  fingerprint: string;
  message?: string;
  route?: string;
  name?: string;
  value?: number;
  release?: string;
}

/**
 * Client telemetry service for sending errors and vitals to the backend
 */
export class ClientTelemetry {
  private errorFingerprints: Set<string> = new Set();
  private events: ClientEvent[] = [];
  private send: (events: ClientEvent[]) => Promise<void>;
  private now: () => number;
  private maxPerMinute: number;
  private release?: string;
  private lastFlushTime = 0;
  private flushTimer?: number;

  constructor(opts: {
    send(events: ClientEvent[]): Promise<void>;
    now?(): number;
    maxPerMinute?: number;
    release?: string;
  }) {
    this.send = opts.send;
    this.now = opts.now ?? (() => Date.now());
    this.maxPerMinute = opts.maxPerMinute ?? 10;
    this.release = opts.release;
  }

  /**
   * Hash function for fingerprinting errors
   */
  private hash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }

  /**
   * Generate fingerprint for an error
   */
  private generateFingerprint(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    // Remove numbers from message for better deduplication
    const normalized = message.replace(/\d+/g, '#');
    return this.hash(normalized);
  }

  /**
   * Report an error
   */
  reportError(error: unknown, route?: string): void {
    const fingerprint = this.generateFingerprint(error);

    // Check rate limit and deduplication
    if (this.errorFingerprints.has(fingerprint)) {
      return; // Duplicate, skip
    }

    if (this.errorFingerprints.size >= this.maxPerMinute) {
      return; // Rate limited
    }

    this.errorFingerprints.add(fingerprint);

    const message = error instanceof Error ? error.message : String(error);
    this.events.push({
      kind: 'error',
      fingerprint,
      message: message.length > 500 ? message.slice(0, 500) : message,
      route,
      release: this.release,
    });

    this.scheduleFlush();
  }

  /**
   * Report a vital (performance metric)
   */
  reportVital(name: string, value: number): void {
    // 10% sampling
    if (Math.random() > 0.1) return;

    this.events.push({
      kind: 'vital',
      fingerprint: `vital_${name}`,
      name,
      value,
      release: this.release,
    });

    this.scheduleFlush();
  }

  /**
   * Schedule a flush (debounced)
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush().catch(() => {
        // Ignore flush errors
      });
    }, 1000);
  }

  /**
   * Flush events to backend (max 20 per batch)
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.events.length === 0) return;

    const batch = this.events.splice(0, 20);
    this.lastFlushTime = this.now();

    // Reset error fingerprints after 1 minute
    if (this.now() - this.lastFlushTime > 60000) {
      this.errorFingerprints.clear();
    }

    try {
      await this.send(batch);
    } catch {
      // Silently fail, don't re-add events
    }
  }
}
