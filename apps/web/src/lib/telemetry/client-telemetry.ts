/** Wire contract of POST /api/v1/telemetry/client-errors (M00 §4.14). */
export type VitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
export type ClientEvent =
  | { kind: 'error'; fingerprint: string; message?: string; route?: string; release?: string }
  | { kind: 'vital'; name: VitalName; value: number; route?: string; release?: string };

export interface ClientTelemetryOptions {
  send(events: ClientEvent[]): Promise<void>;
  now?(): number;
  random?(): number;
  maxPerMinute?: number;
  vitalSampleRate?: number;
  release?: string;
}

const WINDOW_MS = 60_000;
const BATCH_SIZE = 20;
const MAX_MESSAGE = 500;
const FLUSH_DELAY_MS = 1000;

/**
 * Client errors and web vitals (spec 02 §7): errors deduplicated by fingerprint for the session,
 * at most `maxPerMinute` error reports in any rolling 60 s window, batches of ≤ 20, vitals sampled.
 */
export class ClientTelemetry {
  private readonly seen = new Set<string>();
  private readonly reportTimes: number[] = [];
  private readonly queue: ClientEvent[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly maxPerMinute: number;
  private readonly vitalSampleRate: number;

  constructor(private readonly opts: ClientTelemetryOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.maxPerMinute = opts.maxPerMinute ?? 10;
    this.vitalSampleRate = opts.vitalSampleRate ?? 0.1;
  }

  reportError(error: unknown, route?: string): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const fingerprint = fingerprintOf(message);
    if (this.seen.has(fingerprint) || !this.withinRateLimit()) return;
    this.seen.add(fingerprint);
    this.reportTimes.push(this.now());
    this.enqueue({ kind: 'error', fingerprint, message: message.slice(0, MAX_MESSAGE), route: stripQuery(route), release: this.opts.release });
  }

  reportVital(name: VitalName, value: number): void {
    if (this.random() >= this.vitalSampleRate) return;
    this.enqueue({ kind: 'vital', name, value, release: this.opts.release });
  }

  async flush(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    while (this.queue.length > 0) {
      try {
        await this.opts.send(this.queue.splice(0, BATCH_SIZE));
      } catch {
        return; // telemetry must never break the app; dropped batches are acceptable
      }
    }
  }

  private withinRateLimit(): boolean {
    const cutoff = this.now() - WINDOW_MS;
    while (this.reportTimes.length > 0 && (this.reportTimes[0] ?? 0) <= cutoff) this.reportTimes.shift();
    return this.reportTimes.length < this.maxPerMinute;
  }

  private enqueue(event: ClientEvent): void {
    this.queue.push(event);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
  }
}

/** Digits are normalised so "order 123 failed" and "order 456 failed" are one fingerprint. */
export function fingerprintOf(message: string): string {
  const normalised = message.replace(/\d+/g, '#');
  let hash = 0;
  for (let i = 0; i < normalised.length; i++) hash = (Math.imul(hash, 31) + normalised.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Query strings can carry personal data; never report them (spec 02 §7). */
function stripQuery(route?: string): string | undefined {
  return route?.split('?')[0]?.slice(0, 200);
}
