import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG, CLOCK, ID_GENERATOR, OUTBOX } from '../../../kernel/tokens';
import { AuditLog } from '../../../kernel/audit/audit-log';
import { Outbox } from '../../../kernel/outbox/outbox';
import { Clock } from '../../../kernel/domain/clock';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { DomainEventFactory } from '../../../kernel/domain/domain-event';
import { Transaction } from '../../../kernel/persistence/unit-of-work';

export interface ChangeRecord {
  event: { type: string; subject: string; data: Record<string, unknown> };
  audit: { action: string; entityType: string; entityId: string; metadata?: Record<string, unknown>; before?: unknown; after?: unknown };
}

/**
 * Writes the domain event (outbox) and the audit entry in the caller's transaction, so a state change,
 * its event and its audit trail commit or roll back together (HLD §12 outbox; spec 03 audit).
 */
@Injectable()
export class TenancyRecorder {
  private readonly events: DomainEventFactory;

  constructor(
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(AUDIT_LOG) private readonly auditLog: AuditLog,
    @Inject(CLOCK) clock: Clock,
    @Inject(ID_GENERATOR) ids: IdGenerator,
  ) {
    this.events = new DomainEventFactory(clock, ids);
  }

  async record(tx: Transaction, change: ChangeRecord): Promise<void> {
    await this.outbox.add(tx, this.events.create({ ...change.event, source: 'tenant', tenantId: tx.tenantId }));
    await this.auditLog.append(tx, change.audit);
  }
}
