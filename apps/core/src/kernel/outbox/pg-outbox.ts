import { Pool } from 'pg';
import { DomainEvent } from '../domain/domain-event';
import { Transaction, isPgTransaction } from '../persistence/unit-of-work';
import { MAX_DELIVERY_ATTEMPTS, Outbox, OutboxSource } from './outbox';

interface OutboxRow {
  id: string; tenant_id: string; type: string; source: string; subject: string;
  data: Record<string, unknown>; data_version: number; trace_id: string | null; occurred_at: Date;
}

/**
 * Write side runs in the caller's RLS-scoped transaction; the read side (relay) must be given
 * a pool connected as the owner role because it relays across tenants.
 */
export class PgOutbox implements Outbox, OutboxSource {
  constructor(private readonly relayPool: Pool) {}

  async add(tx: Transaction, event: DomainEvent): Promise<void> {
    if (!isPgTransaction(tx)) throw new Error('PgOutbox requires a Postgres transaction');
    await tx.query(
      `insert into outbox_event (id, tenant_id, type, source, subject, data, data_version, trace_id, occurred_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [event.id, event.tenantId, event.type, event.source, event.subject, JSON.stringify(event.data), event.dataVersion, event.traceId ?? null, event.occurredAt],
    );
  }

  async fetchUnpublished(limit: number): Promise<DomainEvent[]> {
    const { rows } = await this.relayPool.query<OutboxRow>(
      'select * from outbox_event where published_at is null and attempts < $2 order by occurred_at, id limit $1',
      [limit, MAX_DELIVERY_ATTEMPTS],
    );
    return rows.map(toEvent);
  }

  async markPublished(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.relayPool.query('update outbox_event set published_at = now() where id = any($1)', [ids]);
  }

  async markFailed(id: string, error: string): Promise<number> {
    const { rows } = await this.relayPool.query<{ attempts: number }>(
      'update outbox_event set attempts = attempts + 1, last_error = $2 where id = $1 returning attempts',
      [id, error.slice(0, 1000)],
    );
    return rows[0]?.attempts ?? 0;
  }

  async countPending(): Promise<number> {
    const { rows } = await this.relayPool.query<{ n: string }>('select count(*) as n from outbox_event where published_at is null and attempts < $1', [MAX_DELIVERY_ATTEMPTS]);
    return Number(rows[0]?.n ?? 0);
  }
}

function toEvent(r: OutboxRow): DomainEvent {
  return {
    id: r.id, specVersion: '1.0', type: r.type, source: r.source, subject: r.subject, tenantId: r.tenant_id,
    occurredAt: r.occurred_at.toISOString(), dataVersion: r.data_version, traceId: r.trace_id ?? undefined, data: r.data,
  };
}
