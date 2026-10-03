import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';

const run = process.env.DATABASE_URL ? describe : describe.skip;

/** AC-M03-14 (+ AC-M02 schema): migrations apply; RLS isolates parties; the consent ledger is append-only for the app role. */
run('AC-M03-14 party schema on Postgres', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = Date.now().toString(36);
  const tenantA = `ten_pa_${suffix}`;
  const tenantB = `ten_pb_${suffix}`;

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

  const insertParty = (tenantId: string, id: string) =>
    asTenant(
      tenantId,
      `insert into party (id, tenant_id, kind, display_name, display_name_norm, source_kind, status, created_at, updated_at)
       values ($1, $2, 'PERSON', 'Asha Rao', 'asha rao', 'MANUAL', 'ACTIVE', now(), now())`,
      [id, tenantId],
    );

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    for (const id of [tenantA, tenantB]) {
      await owner.query(
        `insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty')`,
        [id],
      );
    }
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
  });

  it('AC-M03-14 applies 020_distribution and 030_party', async () => {
    const { rows } = await owner.query("select name from schema_migrations where name in ('020_distribution', '030_party') order by name");
    expect(rows.map((r) => r.name)).toEqual(['020_distribution', '030_party']);
  });

  it('AC-M03-14 isolates parties and contact points between tenants under RLS', async () => {
    await insertParty(tenantA, `pty_a_${suffix}`);
    await asTenant(tenantA, "insert into contact_point (tenant_id, party_id, channel, value_enc, value_hash, masked, is_primary) values ($1, $2, 'MOBILE', 'enc', 'h1', '+91******0001', true)", [tenantA, `pty_a_${suffix}`]);

    expect(await asTenant(tenantB, 'select id from party')).toHaveLength(0);
    expect(await asTenant(tenantB, "select party_id from contact_point where value_hash = 'h1'")).toHaveLength(0);
    expect((await asTenant<{ id: string }>(tenantA, 'select id from party')).map((r) => r.id)).toEqual([`pty_a_${suffix}`]);
  });

  it('AC-M03-14 refuses a row written for another tenant', async () => {
    await expect(insertParty(tenantA, `pty_x_${suffix}`).then(() => asTenant(tenantB, "update party set display_name = 'x' where id = $1 returning id", [`pty_x_${suffix}`])))
      .resolves.toHaveLength(0);
    await expect(
      asTenant(tenantA, `insert into party (id, tenant_id, kind, display_name, display_name_norm, source_kind, status, created_at, updated_at)
        values ($1, $2, 'PERSON', 'Spoof', 'spoof', 'MANUAL', 'ACTIVE', now(), now())`, [`pty_s_${suffix}`, tenantB]),
    ).rejects.toThrow(/row-level security/);
  });

  it('AC-M03-14 keeps the consent ledger append-only for the application role', async () => {
    const partyId = `pty_c_${suffix}`;
    await insertParty(tenantA, partyId);
    await asTenant(tenantA, `insert into consent_record (id, tenant_id, party_id, purpose, channel, granted, notice_version, source, captured_by, occurred_at)
      values ($1, $2, $3, 'MARKETING', 'SMS', true, 'n1', 'ASSISTED', 'member_1', now())`, [`cns_${suffix}`, tenantA, partyId]);

    await expect(asTenant(tenantA, 'update consent_record set granted = false where id = $1', [`cns_${suffix}`])).rejects.toThrow(/permission denied/);
    await expect(asTenant(tenantA, 'delete from consent_record where id = $1', [`cns_${suffix}`])).rejects.toThrow(/permission denied/);
  });

  it('AC-M03-14 uses the contact-hash index for lookups', async () => {
    const plan = await owner.query("set enable_seqscan = off; explain select party_id from contact_point where tenant_id = 'x' and value_hash = 'h'").catch(() => undefined);
    const rows = Array.isArray(plan) ? plan[1].rows : [];
    expect(JSON.stringify(rows)).toMatch(/contact_point_hash_idx|contact_point_pkey/);
  });
});
