import { Pool } from 'pg';
import { Inbox } from './inbox';

export class PgInbox implements Inbox {
  constructor(private readonly pool: Pool) {}

  async processOnce(consumer: string, eventId: string, fn: () => Promise<void>): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query(
        'insert into inbox_message (consumer, event_id) values ($1, $2) on conflict do nothing returning consumer',
        [consumer, eventId]
      );
      if (result.rows.length === 0) {
        await client.query('commit');
        return false;
      }
      await fn();
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
