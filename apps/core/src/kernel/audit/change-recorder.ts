import { AuditLog } from './audit-log';
import { Outbox } from '../outbox/outbox';
import { Clock } from '../domain/clock';
import { IdGenerator } from '../domain/id-generator';
import { DomainEventFactory } from '../domain/domain-event';
import { Transaction } from '../persistence/unit-of-work';

export interface ChangeRecord {
  event?: { type: string; subject: string; data: Record<string, unknown> };
  audit: { action: string; entityType: string; entityId: string; metadata?: Record<string, unknown>; before?: unknown; after?: unknown };
}

/**
 * Writes a module's domain event (outbox) and audit entry inside the caller's transaction, so the state
 * change, its event and its audit trail commit or roll back together (HLD §12, spec 03 audit).
 */
export class ChangeRecorder {
  private readonly events: DomainEventFactory;

  constructor(
    private readonly source: string,
    deps: { outbox: Outbox; auditLog: AuditLog; clock: Clock; ids: IdGenerator },
    private readonly outbox = deps.outbox,
    private readonly auditLog = deps.auditLog,
  ) {
    this.events = new DomainEventFactory(deps.clock, deps.ids);
  }

  async record(tx: Transaction, change: ChangeRecord): Promise<void> {
    if (change.event) await this.outbox.add(tx, this.events.create({ ...change.event, source: this.source, tenantId: tx.tenantId }));
    await this.auditLog.append(tx, change.audit);
  }
}
