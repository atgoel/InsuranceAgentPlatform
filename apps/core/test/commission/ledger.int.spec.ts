import { Pool } from 'pg';
import { runMigrations, MIGRATIONS_DIR } from '../../src/kernel/db/migrate';
const run = process.env.DATABASE_URL ? describe : describe.skip;
run('AC-M10-08 RECEIVED ledger durable idempotency and append-only RLS', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const tenant = `ten_comm_${Date.now()}`;
  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    await owner.query(
      "insert into tenant (id,slug,display_name,kind,status,plan_code,deployment_mode,crm_mode) values ($1,$1,$1,'ORGANISATION','active','TEAM','pooled','solo_lite')",
      [tenant],
    );
  });
  afterAll(async () => {
    await owner.end();
    await app.end();
  });
  it('AC-M07-14 restricts ledger rows to their tenant and denies mutations', async () => {
    const c = await app.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.tenant_id',$1,true)", [tenant]);
      await c.query(
        "insert into commission_entry (id,tenant_id,held_policy_id,seller_member_id,kind,amount_paise,occurred_on,import_key,created_at) values ($1,$2,'hp','mem','RECEIVED',123,'2026-10-03','row1',now())",
        [`cme_${tenant}`, tenant],
      );
      expect((await c.query('select id from commission_entry')).rows).toHaveLength(1);
      await c.query('savepoint before_mutation');
      await expect(c.query('update commission_entry set amount_paise=0')).rejects.toMatchObject({ code: '42501' });
      await c.query('rollback to savepoint before_mutation');
      await expect(c.query('delete from commission_entry')).rejects.toMatchObject({ code: '42501' });
      await c.query('rollback to savepoint before_mutation');
      const replay = await c.query(
        "insert into commission_entry (id,tenant_id,held_policy_id,seller_member_id,kind,amount_paise,occurred_on,import_key,created_at) values ($1,$2,'hp','mem','RECEIVED',123,'2026-10-03','row1',now()) on conflict (tenant_id,import_key) do nothing returning id",
        ['replay', tenant],
      );
      expect(replay.rows).toHaveLength(0);
      await c.query("select set_config('app.tenant_id',$1,true)", ['different_tenant']);
      expect((await c.query('select id from commission_entry')).rows).toHaveLength(0);
    } finally {
      await c.query('rollback');
      c.release();
    }
    const probe = await app.connect();
    try {
      await probe.query('begin');
      await probe.query("select set_config('app.tenant_id',$1,true)", [tenant]);
      expect((await probe.query('select * from commission_entry')).rows).toHaveLength(0);
    } finally {
      await probe.query('rollback');
      probe.release();
    }
  });
});
