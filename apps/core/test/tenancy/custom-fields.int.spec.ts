import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { FixedClock } from '../../src/kernel/domain/clock';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { Tracer } from '../../src/kernel/observability/tracer';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
import { PgCustomFieldRepository } from '../../src/modules/tenancy/infrastructure/pg-custom-field.repository';
import { customFieldRepositoryContract } from './custom-fields.contract';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
const app = new Pool({ connectionString: process.env.DATABASE_URL });
const clock = new FixedClock(new Date('2026-10-03T06:00:00.000Z'));
const uow = new PgUnitOfWork(app, new Tracer(clock, new MetricsRegistry()));
const suffix = Date.now().toString(36);
const tenantA = `ten_cfa_${suffix}`;
const tenantB = `ten_cfb_${suffix}`;
const repo = new PgCustomFieldRepository();

/** AC-CR001-04: the Postgres adapter behaves like the in-memory one and RLS isolates definitions. */
run('AC-CR001-04 Postgres custom field repository', () => {
  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    for (const id of [tenantA, tenantB]) {
      await owner.query(
        `insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty')`, [id]);
    }
  });

  afterAll(async () => {
    // RLS is forced even for the owner: delete each tenant's rows as that tenant.
    for (const tenant of [tenantA, tenantB]) {
      const client = await owner.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('app.tenant_id', $1, true)", [tenant]);
        await client.query('delete from custom_field_definition');
        await client.query('commit');
      } finally {
        client.release();
      }
    }
    await owner.query('delete from tenant where id = any($1)', [[tenantA, tenantB]]);
    await Promise.all([owner.end(), app.end()]);
  });

  customFieldRepositoryContract('Postgres custom field repository', async () => ({ repo, run: (tenantId, work) => uow.run(tenantId, work), tenantA, tenantB, suffix }));

  it('AC-CR001-04 RLS: without a tenant the app role sees no rows, with one only its own', async () => {
    const none = await app.query<{ n: number }>('select count(*)::int as n from custom_field_definition');
    expect(none.rows[0]?.n).toBe(0);
    const ids = await uow.run(tenantB, async (tx) => (await repo.list(tx)).map((d) => d.id));
    expect(ids).toEqual([`cfd_l1_${suffix}`, `cfd_l2_${suffix}`, `cfd_l3_${suffix}`, `cfd_k_${suffix}`]);
  });
});
