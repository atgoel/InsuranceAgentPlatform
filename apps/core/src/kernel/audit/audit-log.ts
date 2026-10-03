import { createHash } from 'crypto';
import { Clock } from '../domain/clock';
import { IdGenerator } from '../domain/id-generator';
import { Redactor } from '../observability/redactor';
import { RequestContext } from '../observability/request-context';
import { Transaction } from '../persistence/unit-of-work';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface StoredAuditEvent {
  id: string;
  tenantId: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  traceId?: string;
  beforeHash?: string;
  afterHash?: string;
  metadata: Record<string, unknown>;
}

export interface AuditLog {
  append(tx: Transaction, entry: AuditEntry): Promise<StoredAuditEvent>;
}

/**
 * AC-M00-22 (audit): canonicalHash
 * Creates a SHA256 hash of a value's canonical JSON representation.
 * Keys are sorted for determinism; undefined values return undefined.
 */
export function canonicalHash(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const json = JSON.stringify(value, Object.keys(value as any).sort());
    return createHash('sha256').update(json).digest('hex');
  } catch {
    return undefined;
  }
}

/**
 * AC-M00-22 (audit): InMemoryAuditLog
 * In-memory implementation of the audit log.
 * Stores hashes of before/after values (never raw values) and redacts metadata.
 */
export class InMemoryAuditLog implements AuditLog {
  readonly events: StoredAuditEvent[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly redactor: Redactor,
  ) {}

  async append(tx: Transaction, entry: AuditEntry): Promise<StoredAuditEvent> {
    const context: any = RequestContext.current();
    const actor = context?.actor ?? 'system';
    const traceId = context?.traceId;

    const event: StoredAuditEvent = {
      id: this.ids.next('aud'),
      tenantId: tx.tenantId,
      actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      occurredAt: this.clock.now().toISOString(),
      traceId,
      beforeHash: canonicalHash(entry.before),
      afterHash: canonicalHash(entry.after),
      metadata: entry.metadata ? (this.redactor.redact(entry.metadata) as Record<string, unknown>) : {},
    };

    this.events.push(event);
    return event;
  }
}
