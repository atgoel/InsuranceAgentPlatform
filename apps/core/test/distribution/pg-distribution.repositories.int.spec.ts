import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { FixedClock } from '../../src/kernel/domain/clock';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { Tracer } from '../../src/kernel/observability/tracer';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
import {
  PgChecklistRepository, PgInsurerCodeRepository, PgLeaveRepository, PgLicenceRepository, PgMemberRepository, PgOrgUnitRepository, PgRoleRepository,
} from '../../src/modules/distribution/infrastructure/pg-distribution.repositories';
import { describeDistributionRepositories } from './repositories.contract';

const enabled = Boolean(process.env.DATABASE_URL);
const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
const app = new Pool({ connectionString: process.env.DATABASE_URL });
const uow = new PgUnitOfWork(app, new Tracer(new FixedClock(new Date('2026-10-03T06:00:00.000Z')), new MetricsRegistry()));
const tenants = new Set<string>();

if (enabled) {
  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    // RLS is forced even for the owner, so each tenant's rows are deleted inside that tenant's context.
    for (const tenant of tenants) {
      const client = await owner.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('app.tenant_id', $1, true)", [tenant]);
        for (const table of ['licence_alert', 'insurer_code', 'member_leave', 'licence', 'onboarding_checklist', 'member', 'tenant_role', 'org_unit']) await client.query(`delete from ${table}`);
        await client.query('commit');
      } finally {
        client.release();
      }
    }
    await owner.query('delete from tenant where id = any($1)', [[...tenants]]);
    await Promise.all([owner.end(), app.end()]);
  });
}

if (enabled) {
  describeDistributionRepositories(
    'postgres',
    () => ({
      orgUnits: new PgOrgUnitRepository(), members: new PgMemberRepository(), checklists: new PgChecklistRepository(), licences: new PgLicenceRepository(),
      insurerCodes: new PgInsurerCodeRepository(), leaves: new PgLeaveRepository(), roles: new PgRoleRepository(),
    }),
    async (tenantId, work) => {
      if (!tenants.has(tenantId)) {
        await owner.query(
          `insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty') on conflict do nothing`,
          [tenantId]);
        tenants.add(tenantId);
      }
      return uow.run(tenantId, work);
    },
  );
} else {
  describe.skip('AC-M02-14 distribution repositories: postgres', () => {
    it('AC-M02-14 requires DATABASE_URL', () => undefined);
  });
}
