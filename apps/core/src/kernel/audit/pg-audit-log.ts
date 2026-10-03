import { Clock } from '../domain/clock';
import { IdGenerator } from '../domain/id-generator';
import { Redactor } from '../observability/redactor';
import { RequestContext } from '../observability/request-context';
import { Transaction, isPgTransaction } from '../persistence/unit-of-work';
import { AuditEntry, AuditLog, StoredAuditEvent, canonicalHash } from './audit-log';

/** Append-only audit log in the caller's RLS-scoped transaction; only hashes of before/after are stored (M00 §8). */
export class PgAuditLog implements AuditLog {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly redactor: Redactor,
  ) {}

  async append(tx: Transaction, entry: AuditEntry): Promise<StoredAuditEvent> {
    if (!isPgTransaction(tx)) throw new Error('PgAuditLog requires a Postgres transaction');
    const ctx = RequestContext.current();
    const event: StoredAuditEvent = {
      id: this.ids.next('aud'),
      tenantId: tx.tenantId,
      actor: ctx?.actor ?? 'system',
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      occurredAt: this.clock.now().toISOString(),
      traceId: ctx?.traceId,
      beforeHash: canonicalHash(entry.before),
      afterHash: canonicalHash(entry.after),
      metadata: (this.redactor.redact(entry.metadata ?? {}) as Record<string, unknown>) ?? {},
    };
    await tx.query(
      `insert into audit_event (id, tenant_id, actor, action, entity_type, entity_id, occurred_at, trace_id, before_hash, after_hash, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [event.id, event.tenantId, event.actor, event.action, event.entityType, event.entityId, event.occurredAt, event.traceId ?? null, event.beforeHash ?? null, event.afterHash ?? null, JSON.stringify(event.metadata)],
    );
    return event;
  }
}
