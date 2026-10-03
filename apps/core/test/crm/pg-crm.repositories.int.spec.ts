import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { FixedClock } from '../../src/kernel/domain/clock';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { Tracer } from '../../src/kernel/observability/tracer';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
import { Lead } from '../../src/modules/crm/domain/lead';
import {
  PgActivityRepository, PgCrmSyncStateRepository, PgLeadImportRepository, PgLeadRepository, PgOpportunityRepository, PgPublicLeadGuard, PgRoutingRuleRepository, PgTaskRepository,
} from '../../src/modules/crm/infrastructure/pg-crm.repositories';
import { ContractHarness, crmRepositoriesContract } from './repositories.contract';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('AC-M04-21 Postgres CRM repositories', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const uow = new PgUnitOfWork(app, new Tracer(new FixedClock(new Date('2026-10-03T06:00:00.000Z')), new MetricsRegistry()));
  const suffix = Date.now().toString(36);
  const tenants: string[] = [];
  let seq = 0;
  const uid = (label: string) => `${label}_${suffix}_${(seq += 1)}`;
  const leads = new PgLeadRepository();
  const activities = new PgActivityRepository();

  type Query = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

  async function asTenant<T>(tenantId: string, work: (q: Query) => Promise<T>, pool: Pool = app): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await work(async (sql, params) => (await client.query(sql, params)).rows);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  const harness = async (): Promise<ContractHarness> => ({
    repos: {
      leads, activities, tasks: new PgTaskRepository(), opportunities: new PgOpportunityRepository(), rules: new PgRoutingRuleRepository(), imports: new PgLeadImportRepository(),
      guard: new PgPublicLeadGuard(), sync: new PgCrmSyncStateRepository(),
    },
    run: (tenantId, work) => uow.run(tenantId, work),
    uid,
    newTenant: async () => {
      const tenantId = uid('ten_crm');
      tenants.push(tenantId);
      await owner.query(
        `insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty')`, [tenantId]);
      const parties: [string, string, string] = [uid('pty'), uid('pty'), uid('pty')];
      for (const id of parties) {
        await asTenant(tenantId, (q) => q(`insert into party (id, tenant_id, kind, display_name, display_name_norm, source_kind, status, created_at, updated_at)
          values ($1, $2, 'PERSON', 'Asha', 'asha', 'LEAD', 'ACTIVE', now(), now())`, [id, tenantId]));
      }
      return { tenantId, parties };
    },
  });

  /** Owner ids the contract uses; crm_lead.owner_member_id references member(id), so they must exist (ids are global). */
  const MEMBERS = ['mem_1', 'mem_2', 'mem_3', 'mem_9', 'mem_a', 'mem_site'];
  const memberTenant = uid('ten_crm_members');

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    await owner.query(`insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty')`, [memberTenant]);
    await asTenant(memberTenant, async (q) => {
      await q(`insert into org_unit (tenant_id, id, kind, name, territory_codes) values ($1, 'ou_root', 'HEAD_OFFICE', 'Head office', '{}')`, [memberTenant]);
      for (const id of MEMBERS) {
        await q(`insert into member (id, tenant_id, display_name, contact_hash, roles, org_unit_id, status, invited_at, invite_expires_at)
          values ($1, $2, $1, $3, '{SALESPERSON}', 'ou_root', 'active', now(), now()) on conflict (id) do nothing`, [id, memberTenant, `hash_${id}_${memberTenant}`]);
      }
    }, owner);
  });

  afterAll(async () => {
    // RLS is forced even for the owner: delete each tenant's rows as that tenant, children first.
    for (const tenantId of tenants) {
      await asTenant(tenantId, async (q) => {
        for (const table of ['crm_sync_state', 'crm_lead_import_row', 'crm_lead_import', 'crm_public_lead_rate', 'crm_routing_cursor', 'crm_routing_rule', 'crm_opportunity', 'crm_task', 'crm_activity', 'crm_lead', 'party']) {
          await q(`delete from ${table}`);
        }
      }, owner);
    }
    if (tenants.length) await owner.query('delete from tenant where id = any($1)', [tenants]);
    await asTenant(memberTenant, async (q) => {
      await q('delete from member');
      await q('delete from org_unit');
    }, owner);
    await owner.query('delete from tenant where id = $1', [memberTenant]);
    await Promise.all([owner.end(), app.end()]);
  });

  crmRepositoriesContract('AC-M04-21 Postgres', harness);

  describe('AC-M04-21 Postgres-only guarantees', () => {
    it('AC-M04-21 the activity log is append-only for the app role', async () => {
      const { tenantId } = await (await harness()).newTenant();
      const actId = uid('act');
      await uow.run(tenantId, (tx) => activities.add(tx, { id: actId, subjectType: 'LEAD', subjectId: 'lead_x', kind: 'NOTE', occurredAt: '2026-10-03T06:00:00.000Z' }));
      await expect(asTenant(tenantId, (q) => q('update crm_activity set summary = $1 where id = $2', ['x', actId]))).rejects.toThrow(/permission denied/);
      await expect(asTenant(tenantId, (q) => q('delete from crm_activity where id = $1', [actId]))).rejects.toThrow(/permission denied/);
    });

    it('AC-M04-03 assigned_at records when the owner last changed, not later edits', async () => {
      const { tenantId, parties } = await (await harness()).newTenant();
      const id = uid('lead');
      const touch = { channel: 'web', at: '2026-10-03T05:00:00.000Z' };
      const lead = Lead.capture({ id, partyId: parties[0], productInterest: 'TERM_LIFE', attribution: { source: 'WEB_FORM', firstTouch: touch, lastTouch: touch }, now: new Date('2026-10-03T05:00:00.000Z'), by: 'system' });
      await uow.run(tenantId, (tx) => leads.save(tx, lead));
      const assignedAt = async () => {
        const rows = await asTenant(tenantId, (q) => q('select assigned_at from crm_lead where id = $1', [id]));
        const value = rows[0].assigned_at as Date | null;
        return value ? value.toISOString() : null;
      };
      expect(await assignedAt()).toBeNull();
      lead.assign('mem_1', 'ou_1', 30, new Date('2026-10-03T05:10:00.000Z'));
      await uow.run(tenantId, (tx) => leads.save(tx, lead));
      expect(await assignedAt()).toBe('2026-10-03T05:10:00.000Z');
      lead.setTemperature('HOT');
      lead.qualify({ need: 'PROTECTION' });
      await uow.run(tenantId, (tx) => leads.save(tx, lead));
      expect(await assignedAt()).toBe('2026-10-03T05:10:00.000Z');
      lead.unassign();
      await uow.run(tenantId, (tx) => leads.save(tx, lead));
      expect(await assignedAt()).toBeNull();
    });

    it('AC-M04-21 an ISSUED opportunity without the insurer sale reference is refused by the CHECK constraint', async () => {
      const { tenantId, parties } = await (await harness()).newTenant();
      await expect(asTenant(tenantId, (q) => q(
        `insert into crm_opportunity (id, tenant_id, party_id, product_interest, title, expected_premium_paise, stage, owner_member_id, stage_entered_at, created_at)
         values ($1, $2, $3, 'TERM_LIFE', 'Term', 1500000, 'ISSUED', 'mem_x', now(), now())`, [uid('opp'), tenantId, parties[0]]))).rejects.toThrow(/check constraint/);
    });

    it('AC-M04-21 a repository used outside a Postgres transaction fails loudly', async () => {
      await expect(leads.get({ tenantId: 'ten_x', kind: 'memory' }, 'lead_x')).rejects.toThrow('Postgres repository used outside a Postgres transaction');
    });
  });
});
