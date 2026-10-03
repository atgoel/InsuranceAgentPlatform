import { Pool } from 'pg';
import { UnitOfWork, PgTransaction } from './unit-of-work';
import { Tracer } from '../observability/tracer';

export class PgUnitOfWork implements UnitOfWork {
  constructor(
    private readonly pool: Pool,
    private readonly tracer: Tracer,
  ) {}

  async run<T>(tenantId: string, work: (tx: PgTransaction) => Promise<T>): Promise<T> {
    return this.tracer.span('pg.transaction', async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);

        const tx: PgTransaction = {
          tenantId,
          kind: 'pg',
          query: async (sql, params) => {
            const result = await client.query(sql, params);
            return { rows: result.rows, rowCount: result.rowCount ?? 0 };
          },
        };

        const result = await work(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }, { dep: 'pg', op: 'transaction' });
  }
}
