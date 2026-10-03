import { createHash } from 'crypto';
import { Clock } from '../domain/clock';

export class ErrorDeduplicator {
  private windowMs: number;
  private maxPerWindow: number;
  private currentWindow: number = 0;
  private windowCounts: Record<string, number> = {};
  private suppressedCounts: Record<string, number> = {};
  private clock: Clock;

  constructor(clock: Clock, opts?: { windowMs?: number; maxPerWindow?: number }) {
    this.clock = clock;
    this.windowMs = opts?.windowMs ?? 60000; // 60 seconds
    this.maxPerWindow = opts?.maxPerWindow ?? 5;
    this.currentWindow = this.getWindow();
  }

  fingerprint(error: unknown): string {
    let type = 'unknown';
    let code = '';
    let stackTrace = '';

    if (error instanceof Error) {
      type = error.constructor.name;
      // Extract the first stack frame location without line/column numbers
      const match = error.stack?.match(/\n\s+at\s+(.+?):\d+:\d+/);
      stackTrace = match ? match[1] : '';
    }

    if (typeof error === 'object' && error !== null && 'code' in error) {
      code = (error as Record<string, unknown>).code as string;
    }

    const combined = `${type}:${code}:${stackTrace}`;
    const hash = createHash('sha1').update(combined).digest('hex');
    return hash.substring(0, 12);
  }

  admit(fingerprint: string): { log: boolean; suppressedSinceLast: number } {
    const currentWindow = this.getWindow();
    let suppressedSinceLast = 0;

    // If we've moved to a new window, reset and report suppressedSinceLast
    if (currentWindow !== this.currentWindow) {
      suppressedSinceLast = this.suppressedCounts[fingerprint] ?? 0;
      this.suppressedCounts[fingerprint] = 0;
      this.windowCounts = {};
      this.currentWindow = currentWindow;
    }

    const count = (this.windowCounts[fingerprint] ?? 0) + 1;
    this.windowCounts[fingerprint] = count;

    if (count <= this.maxPerWindow) {
      return { log: true, suppressedSinceLast };
    } else {
      this.suppressedCounts[fingerprint] = (this.suppressedCounts[fingerprint] ?? 0) + 1;
      return { log: false, suppressedSinceLast: 0 };
    }
  }

  private getWindow(): number {
    return Math.floor(this.clock.now().getTime() / this.windowMs);
  }
}
