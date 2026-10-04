import { validateCommissionReceived } from '../application/commission-validation';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, METRICS, LOGGER, AUDIT_LOG } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { isPgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { TenantBuckets } from '../../../kernel/persistence/tenant-buckets';
import { MetricsRegistry } from '../../../kernel/observability/metrics';
import { Logger } from '../../../kernel/observability/logger';
import { AuditLog } from '../../../kernel/audit/audit-log';
import { CommissionImportPort, CommissionReceivedInput } from '../application/ports';

@Injectable()
export class CommissionImportService implements CommissionImportPort {
  private readonly entries = new TenantBuckets<Map<string, { id: string; input: CommissionReceivedInput }>>(() => new Map());
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(METRICS) private readonly metrics: MetricsRegistry,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}
  async recordReceived(tx: Transaction, input: CommissionReceivedInput): Promise<{ id: string; created: boolean }> {
    validateCommissionReceived(input);
    let id = this.ids.next('cme');
    if (isPgTransaction(tx)) {
      const result = await tx.query<{ id: string }>(
        "insert into commission_entry (id,tenant_id,held_policy_id,insurer_id,seller_member_id,kind,amount_paise,rate_pct,reason,invoice_no,occurred_on,import_key,created_at) values ($1,$2,$3,$4,$5,'RECEIVED',$6,$7,$8,$9,$10,$11,$12) on conflict (tenant_id,import_key) do nothing returning id",
        [
          id,
          tx.tenantId,
          input.heldPolicyId,
          input.insurerId ?? null,
          input.sellerMemberId,
          input.amountPaise,
          input.ratePct ?? null,
          input.reason ?? null,
          input.invoiceNo ?? null,
          input.occurredOn,
          input.importKey,
          this.clock.now().toISOString(),
        ],
      );
      if (!result.rows[0]) {
        const existing = await tx.query<{ id: string }>('select id from commission_entry where import_key=$1', [input.importKey]);
        const row = existing.rows[0];
        if (!row) throw new Error('Commission import conflict could not be resolved');
        return { id: row.id, created: false };
      }
      id = result.rows[0].id;
    } else {
      const existing = this.entries.of(tx).get(input.importKey);
      if (existing) return { id: existing.id, created: false };
      this.entries.of(tx).set(input.importKey, { id, input: { ...input } });
    }
    await this.audit.append(tx, { action: 'commission.received_recorded', entityType: 'commission_entry', entityId: id });
    this.logger.info('commission.received_recorded', 'Commission received', { entityId: id });
    this.metrics.counter('commission_entries_total', 'Commission ledger entries', ['kind']).inc({ kind: 'RECEIVED' });
    return { id, created: true };
  }
}
