import { Pool, PoolClient } from 'pg';
import { Clock } from '../domain/clock';
import { IdempotencyBegin, IdempotencyStore } from './idempotency-store';

const DAY_MS = 24 * 60 * 60 * 1000;

interface IdempotencyRow {
  request_hash: string;
  status: 'in_progress' | 'completed';
  response_status: number | null;
  response_body: unknown;
  expires_at: Date;
}

/** Idempotency records under tenant RLS; each call runs in its own short transaction. */
export class PgIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly ttlMs: number = DAY_MS,
  ) {}

  async begin(tenantId: string, key: string, requestHash: string): Promise<IdempotencyBegin> {
    return this.inTenant(tenantId, async (client) => {
      const now = this.clock.now();
      // Expired records behave as absent: remove so the key can be reused.
      await client.query('delete from idempotency_record where tenant_id = $1 and key = $2 and expires_at <= $3', [tenantId, key, now]);
      const inserted = await client.query(
        `insert into idempotency_record (tenant_id, key, request_hash, status, created_at, expires_at)
         values ($1, $2, $3, 'in_progress', $4, $5) on conflict (tenant_id, key) do nothing`,
        [tenantId, key, requestHash, now, new Date(now.getTime() + this.ttlMs)],
      );
      if (inserted.rowCount === 1) return { state: 'new' };
      const { rows } = await client.query<IdempotencyRow>('select * from idempotency_record where tenant_id = $1 and key = $2', [tenantId, key]);
      return toBegin(rows[0], requestHash);
    });
  }

  async complete(tenantId: string, key: string, status: number, body: unknown): Promise<void> {
    await this.inTenant(tenantId, (client) =>
      client.query(
        `update idempotency_record set status = 'completed', response_status = $3, response_body = $4 where tenant_id = $1 and key = $2`,
        [tenantId, key, status, JSON.stringify(body ?? null)],
      ),
    );
  }

  async release(tenantId: string, key: string): Promise<void> {
    await this.inTenant(tenantId, (client) => client.query('delete from idempotency_record where tenant_id = $1 and key = $2', [tenantId, key]));
  }

  private async inTenant<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

function toBegin(row: IdempotencyRow | undefined, requestHash: string): IdempotencyBegin {
  if (!row) return { state: 'new' };
  if (row.request_hash !== requestHash) return { state: 'conflict' };
  if (row.status === 'in_progress') return { state: 'in_progress' };
  return { state: 'replay', status: row.response_status ?? 200, body: row.response_body };
}
