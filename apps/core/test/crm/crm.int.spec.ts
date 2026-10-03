import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';

const run = process.env.DATABASE_URL ? describe : describe.skip;

/** AC-M04-21: migration applies; RLS isolates CRM tables; client_ref unique; activity log append-only; ISSUED needs the insurer's sale. */
run('AC-M04-21 CRM schema on Postgres', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = Date.now().toString(36);
  const tenantA = `ten_ca_${suffix}`;
  const tenantB = `ten_cb_${suffix}`;

  async function asTenant<T>(tenantId: string, sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const { rows } = await client.query(sql, params);
      await client.query('commit');
      return rows as T[];
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  const partyId = (t: string) => `pty_${t}`;
  const insertLead = (tenantId: string, id: string) =>
    asTenant(
      tenantId,
      `insert into crm_lead (id, tenant_id, party_id, product_interest, stage, temperature, attribution, stage_history, created_at, updated_at)
       values ($1, $2, $3, 'TERM_LIFE', 'NEW', 'WARM', '{"source":"WEB_FORM"}', '[]', now(), now())`,
      [id, tenantId, partyId(tenantId)],
    );
  const insertActivity = (tenantId: string, id: string, clientRef: string) =>
    asTenant(tenantId, "insert into crm_activity (id, tenant_id, subject_type, subject_id, kind, outcome, occurred_at, client_ref) values ($1, $2, 'LEAD', 'lead_x', 'CALL', 'NO_ANSWER', now(), $3)", [id, tenantId, clientRef]);

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    for (const id of [tenantA, tenantB]) {
      await owner.query(
        `insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty')`,
        [id],
      );
      await asTenant(id, `insert into party (id, tenant_id, kind, display_name, display_name_norm, source_kind, status, created_at, updated_at)
        values ($1, $2, 'PERSON', 'Asha', 'asha', 'LEAD', 'ACTIVE', now(), now())`, [partyId(id), id]);
    }
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
  });

  it('AC-M04-21 applies 040_crm and isolates leads between tenants', async () => {
    expect((await owner.query("select 1 from schema_migrations where name = '040_crm'")).rowCount).toBe(1);
    await insertLead(tenantA, `lead_a_${suffix}`);
    expect(await asTenant(tenantB, 'select id from crm_lead')).toHaveLength(0);
    expect((await asTenant<{ id: string }>(tenantA, 'select id from crm_lead')).map((r) => r.id)).toEqual([`lead_a_${suffix}`]);
  });

  it('AC-M04-21 stores an offline activity once per client_ref and keeps the activity log append-only', async () => {
    await insertActivity(tenantA, `act_1_${suffix}`, `ref_${suffix}`);
    await expect(insertActivity(tenantA, `act_2_${suffix}`, `ref_${suffix}`)).rejects.toThrow(/duplicate key/);
    await expect(insertActivity(tenantB, `act_3_${suffix}`, `ref_${suffix}`)).resolves.toEqual([]); // unique per tenant only
    await expect(asTenant(tenantA, "update crm_activity set summary = 'x' where id = $1", [`act_1_${suffix}`])).rejects.toThrow(/permission denied/);
  });

  it('AC-M04-21 refuses an ISSUED opportunity without the insurer sale reference', async () => {
    await expect(
      asTenant(tenantA, `insert into crm_opportunity (id, tenant_id, party_id, product_interest, title, expected_premium_paise, stage, owner_member_id, stage_entered_at, created_at)
        values ($1, $2, $3, 'TERM_LIFE', 'Term', 1500000, 'ISSUED', 'mem_x', now(), now())`, [`opp_${suffix}`, tenantA, partyId(tenantA)]),
    ).rejects.toThrow(/check constraint/);
  });
});
