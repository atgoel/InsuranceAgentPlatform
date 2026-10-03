import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';

const run = process.env.DATABASE_URL ? describe : describe.skip;

/** AC-M01-15: migration applies; RLS isolates tenant-scoped tables; the app role cannot write the directory. */
run('AC-M01-15 tenancy schema on Postgres', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = Date.now().toString(36);
  const tenantA = `ten_a_${suffix}`;
  const tenantB = `ten_b_${suffix}`;

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

  it('AC-M01-15 applies 010_tenancy and seeds tie-up limits as data', async () => {
    const { rows } = await owner.query("select max_insurers from tie_up_limit where entity_type = 'IMF' and line = 'LIFE'");
    expect(rows[0].max_insurers).toBe(6);
    const applied = await owner.query("select 1 from schema_migrations where name = '010_tenancy'");
    expect(applied.rowCount).toBe(1);
  });

  it('AC-M01-15 isolates tie-ups between tenants under RLS', async () => {
    await asTenant(tenantA, "insert into tie_up (tenant_id, insurer_id, line, effective_from) values ($1, 'ins_x', 'LIFE', '2026-01-01')", [tenantA]);

    const seenByB = await asTenant(tenantB, 'select * from tie_up');
    const seenByA = await asTenant<{ insurer_id: string }>(tenantA, 'select * from tie_up');

    expect(seenByB).toHaveLength(0);
    expect(seenByA.map((r) => r.insurer_id)).toEqual(['ins_x']);
  });

  it('AC-M01-15 rejects a write that claims another tenant id', async () => {
    await expect(
      asTenant(tenantB, "insert into brand_kit (tenant_id, brand_name, primary_colour, secondary_colour, typeface) values ($1, 'x', '#1F5FBF', '#163F7F', 'Mukta')", [tenantA]),
    ).rejects.toThrow(/row-level security/);
  });

  it('AC-M01-15 lets the app role read but not write the tenant directory', async () => {
    const rows = await asTenant<{ id: string }>(tenantA, 'select id from tenant where id = $1', [tenantA]);
    expect(rows).toHaveLength(1);
    await expect(
      asTenant(tenantA, "insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ('ten_evil', 'evil', 'x', 'SOLO', 'active', 'SOLO', 'pooled', 'solo_lite')"),
    ).rejects.toThrow(/permission denied/);
  });
});
