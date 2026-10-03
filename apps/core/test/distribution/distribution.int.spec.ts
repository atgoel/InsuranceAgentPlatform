import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';

const run = process.env.DATABASE_URL ? describe : describe.skip;

/** AC-M02-14: migration applies; RLS isolates distribution tables; one active member per contact per tenant. */
run('AC-M02-14 distribution schema on Postgres', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = Date.now().toString(36);
  const tenantA = `ten_da_${suffix}`;
  const tenantB = `ten_db_${suffix}`;

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

  const insertMember = (tenantId: string, id: string, status = 'invited', hash = 'contact_h1') =>
    asTenant(
      tenantId,
      `insert into member (id, tenant_id, display_name, contact_hash, roles, org_unit_id, status, invited_at, invite_expires_at)
       values ($1, $2, 'Asha', $3, '{OPS}', 'ou_root', $4, now(), now() + interval '7 days')`,
      [id, tenantId, hash, status],
    );

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    for (const id of [tenantA, tenantB]) {
      await owner.query(
        `insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty')`,
        [id],
      );
    }
    for (const id of [tenantA, tenantB]) {
      // FORCE RLS applies to the owner too, so the root is written in the tenant's own context.
      await asTenant(id, "insert into org_unit (tenant_id, id, kind, name) values ($1, 'ou_root', 'HEAD_OFFICE', 'Head office')", [id]);
    }
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
  });

  it('AC-M02-14 lets every tenant have its own ou_root and isolates org units and members under RLS', async () => {
    await insertMember(tenantA, `mem_a_${suffix}`);
    expect(await asTenant(tenantB, 'select id from member')).toHaveLength(0);
    expect((await asTenant<{ id: string }>(tenantB, 'select id from org_unit')).map((r) => r.id)).toEqual(['ou_root']);
    expect((await asTenant<{ id: string }>(tenantA, 'select id from member')).map((r) => r.id)).toEqual([`mem_a_${suffix}`]);
  });

  it('AC-M02-14 enforces one active member per contact within a tenant, but not across tenants or after exit', async () => {
    await insertMember(tenantA, `mem_x1_${suffix}`, 'exited', 'contact_dup');
    await insertMember(tenantA, `mem_x2_${suffix}`, 'invited', 'contact_dup');
    await expect(insertMember(tenantA, `mem_x3_${suffix}`, 'invited', 'contact_dup')).rejects.toThrow(/member_contact_active/);
    await expect(insertMember(tenantB, `mem_x4_${suffix}`, 'invited', 'contact_dup')).resolves.toEqual([]);
  });

  it('AC-M02-14 refuses an org unit whose parent belongs to another tenant (composite key)', async () => {
    await expect(
      asTenant(tenantA, "insert into org_unit (tenant_id, id, parent_id, kind, name) values ($1, 'ou_x', 'ou_only_in_b', 'BRANCH', 'X')", [tenantA]),
    ).rejects.toThrow(/foreign key/);
  });
});
