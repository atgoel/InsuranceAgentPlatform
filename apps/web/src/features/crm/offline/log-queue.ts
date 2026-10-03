import type { CallOutcome } from '../api';

/** Activity kinds a seller can log from Today (a subset of the server's ActivitySchema). */
export type QueuedKind = 'CALL' | 'WHATSAPP' | 'NOTE';

export interface QueuedLog {
  clientRef: string;
  leadId: string;
  kind: QueuedKind;
  outcome?: CallOutcome;
  occurredAt: string;
}

export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'crm:log-queue:v1';
const KINDS: readonly QueuedKind[] = ['CALL', 'WHATSAPP', 'NOTE'];
const OUTCOMES: readonly CallOutcome[] = ['CONNECTED', 'NO_ANSWER', 'CALL_BACK', 'WRONG_NUMBER', 'NOT_INTERESTED'];

/**
 * Offline "Log" queue (AC-M04-29). Each action gets its clientRef once, when it is queued, and keeps it across
 * replays, so the server's clientRef dedup makes a replay after an unacknowledged success harmless.
 * Holds ids and enums only — no names, numbers or free text.
 */
export class LogQueue {
  constructor(
    private readonly storage: QueueStorage,
    private readonly newRef: () => string = () => crypto.randomUUID(),
  ) {}

  add(entry: Omit<QueuedLog, 'clientRef'>): QueuedLog {
    const queued: QueuedLog = { ...entry, clientRef: this.newRef() };
    this.write([...this.all(), queued]);
    return queued;
  }

  all(): QueuedLog[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isQueuedLog) : [];
    } catch {
      return []; // corrupt storage must not break the Today screen
    }
  }

  remove(clientRef: string): void {
    this.write(this.all().filter((q) => q.clientRef !== clientRef));
  }

  private write(entries: QueuedLog[]): void {
    if (entries.length === 0) this.storage.removeItem(KEY);
    else this.storage.setItem(KEY, JSON.stringify(entries));
  }
}

function isQueuedLog(v: unknown): v is QueuedLog {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.clientRef === 'string' && typeof o.leadId === 'string' && typeof o.occurredAt === 'string'
    && KINDS.includes(o.kind as QueuedKind) && (o.outcome === undefined || OUTCOMES.includes(o.outcome as CallOutcome));
}

/** Retry later: network failures, timeouts, throttling and server errors. Everything else is final. */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}
