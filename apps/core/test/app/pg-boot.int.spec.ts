import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { OUTBOX_RELAY } from '../../src/kernel/tokens';
import { OutboxRelay } from '../../src/kernel/outbox/outbox-relay';
import { TenancyModule } from '../../src/modules/tenancy/tenancy.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { PartyModule } from '../../src/modules/party/party.module';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { CatalogueModule } from '../../src/modules/catalogue/catalogue.module';
import { AdviceModule } from '../../src/modules/advice/advice.module';
import { istDate, addDays } from '../../src/kernel/domain/ist';
import { FakeTwentyClient } from '../../src/modules/crm/infrastructure/twenty/fake-twenty.client';
import { seedCatalogueIfEmpty } from '../../src/modules/catalogue/infrastructure/seed-catalogue.pg';
import { createTestApp, TestApp } from '../support/test-app';
import { operatorToken, tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from '../crm/fixtures';

const run = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * The whole application on Postgres (PERSISTENCE=pg): every module's adapters, the Postgres unit of work, outbox,
 * inbox, audit and idempotency, then a restart to prove the data outlived the process. Each run uses its own tenant.
 */
run('AC-M00-23 application boot and lead journey on Postgres', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const suffix = Date.now().toString(36);
  const tenantId = `ten_boot_${suffix}`;
  const host = `boot-${suffix}.iap.test`;
  const admin = tokenFor({ tenantId, roles: ['TENANT_ADMIN'], memberId: 'admin' });
  const boot = () =>
    createTestApp({
      imports: [TenancyModule, DistributionModule, PartyModule, CrmModule, CatalogueModule, AdviceModule],
      config: {
        persistence: 'pg',
        databaseUrl: process.env.DATABASE_URL,
        platformDatabaseUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
        staticTenants: { [host]: { tenantId, status: 'active' } },
      },
    });
  let t: TestApp;
  const req = (method: 'get' | 'post' | 'put', path: string, body?: object, token = admin) => {
    const r = t.http[method](path).set('Host', host).set('Authorization', `Bearer ${token}`);
    if (method === 'get') return r;
    return (method === 'post' ? r.set('Idempotency-Key', newIdempotencyKey()) : r).send(body);
  };
  const state: { leadId?: string; partyId?: string; opportunityId?: string; sellerId?: string } = {};

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    await seedCatalogueIfEmpty(owner);
    t = await boot();
  });

  afterAll(async () => {
    await t?.close();
    await owner.end();
  });

  it('AC-M00-23 boots with Postgres adapters and seeds the static tenant into the database', async () => {
    const { rows } = await owner.query<{ id: string; crm_mode: string }>('select id, crm_mode from tenant where id = $1', [tenantId]);
    expect(rows).toEqual([{ id: tenantId, crm_mode: 'twenty' }]);
    expect((await req('get', '/api/v1/tenant')).status).toBe(200);
  });

  it('AC-M00-23 tenant settings, sellers and routing persist (M01, M02, M04) and RLS hides them from an unscoped owner', async () => {
    expect((await req('put', '/api/v1/tenant/tie-ups', { tieUps: [{ insurerId: 'ins_hdfc_life', line: 'LIFE', effectiveFrom: '2025-01-01' }] })).status).toBe(200);
    const seller = await setupSellerWithRouting(t, 'boot_seller', tenantId, host);
    state.sellerId = seller.memberId;
    const unscoped = await owner.query('select status from member where id = $1', [seller.memberId]);
    expect(unscoped.rowCount).toBe(0); // FORCE ROW LEVEL SECURITY applies to the owner too: no tenant set, no rows
    const scope = await req('post', '/api/v1/catalogue/comparison-scopes/evaluations', {});
    expect(scope.status).toBe(200);
    expect((scope.body.versions as Array<{ versionId: string }>).map((v) => v.versionId).sort()).toEqual(['pv_hdfc_sanchay_v1', 'pv_hdfc_saral_v1', 'pv_hdfc_term_v1']);
  });

  it('AC-M00-23 a lead is captured, routed, worked and converted on Postgres (M03, M04)', async () => {
    const mobile = `+9196${String(Date.now()).slice(-8)}`;
    const capture = await req('post', '/api/v1/leads', {
      fullName: 'Asha Verma', mobile, productInterest: 'TERM_LIFE', source: 'WEB_FORM',
      consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE', 'MARKETING'] },
    });
    expect(capture.status).toBe(201);
    expect(capture.body.ownerMemberId).toBe(state.sellerId);
    state.leadId = capture.body.leadId;
    state.partyId = capture.body.partyId;
    const id = state.leadId as string;
    const call = { kind: 'CALL', outcome: 'CONNECTED', clientRef: `ref-${suffix}-01` };
    expect((await req('post', `/api/v1/leads/${id}/activities`, call)).status).toBe(201);
    expect((await req('post', `/api/v1/leads/${id}/activities`, call)).status).toBe(200); // same clientRef → deduplicated
    expect((await req('post', `/api/v1/leads/${id}/stage-transitions`, { to: 'CONTACTED' })).status).toBe(200);
    expect((await req('put', `/api/v1/leads/${id}/qualification`, { need: 'PROTECTION', budgetBand: 'LT_15K', timeline: 'THIS_MONTH' })).status).toBe(200);
    expect((await req('post', `/api/v1/leads/${id}/stage-transitions`, { to: 'QUALIFIED' })).status).toBe(200);
    const conv = await req('post', `/api/v1/leads/${id}/conversion`, {
      partyChoice: 'LEAD_PARTY', productInterest: 'TERM_LIFE', expectedPremiumPaise: 2_500_000, startStage: 'DISCOVERY',
    });
    expect(conv.status).toBe(201);
    state.opportunityId = conv.body.opportunityId;
  });

  async function relayTenantEvents(): Promise<void> {
    // Other integration suites share this DB; subscriber writes can also enqueue follow-on syncs.
    const relay = t.app.get<OutboxRelay>(OUTBOX_RELAY);
    for (let round = 0; round < 20; round += 1) {
      const pending = await owner.query<{ n: string }>('select count(*) as n from outbox_event where tenant_id=$1 and published_at is null and attempts<3', [tenantId]);
      if (Number(pending.rows[0]?.n ?? 0) === 0) return;
      await relay.relayOnce(1000);
    }
    throw new Error('Test tenant outbox did not drain within 20 relay batches');
  }

  it('AC-M00-21 the outbox relay delivers the Postgres outbox to subscribers (Twenty sync)', async () => {
    await relayTenantEvents();
    const twenty = t.app.get(FakeTwentyClient);
    expect(twenty.find('lead', state.leadId as string)?.fields).toMatchObject({ core_id: state.leadId, stage: 'CONVERTED', product_interest: 'TERM_LIFE' });
    expect(twenty.find('opportunity', state.opportunityId as string)?.fields).toMatchObject({ premium_band: '15-30k', stage: 'DISCOVERY' });
    expect((await req('get', `/api/v1/leads/${state.leadId}`)).body.syncState).toBe('synced');
  });

  it('AC-M06-11 a quote is opened, an option added and shared on Postgres; the relayed events move the opportunity and lock the product version (M06)', async () => {
    const opportunityId = state.opportunityId as string;
    const opened = await req('post', '/api/v1/quotes', { opportunityId, insuredPartyIds: [state.partyId], requirements: { sumAssured: '1cr' } });
    expect(opened.status).toBe(201);
    const quoteId = opened.body.id as string;
    const validUntil = addDays(istDate(t.clock.now()), 30);
    const added = await req('post', `/api/v1/quotes/${quoteId}/options`, {
      versionId: 'pv_hdfc_term_v1', source: 'MANUAL_PORTAL', insurerQuoteRef: `QREF-${suffix}`, sumAssuredPaise: 1_000_000_000, policyTermYears: 30,
      premium: { basePaise: 1_000_000, ridersPaise: 100_000, taxPaise: 198_000, totalPaise: 1_298_000, frequency: 'ANNUAL' },
      coverage: [], exclusions: [], waitingPeriods: [], assumptions: {}, validUntil,
    });
    expect(added.status).toBe(201);
    expect(added.body.options).toHaveLength(1);
    expect((await req('post', `/api/v1/quotes/${quoteId}/shares`)).status).toBe(200);

    await relayTenantEvents();

    const quote = await req('get', `/api/v1/quotes/${quoteId}`);
    expect(quote.body).toMatchObject({ id: quoteId, status: 'SHARED' });
    expect(quote.body.options[0]).toMatchObject({ versionId: 'pv_hdfc_term_v1', validUntil, premium: { totalPaise: 1_298_000 } });
    const board = await req('get', '/api/v1/opportunities');
    const items = (board.body.columns as Array<{ items: Array<{ id: string; stage: string }> }>).flatMap((c) => c.items);
    expect(items.find((i) => i.id === opportunityId)?.stage).toBe('QUOTE_SHARED');
    const edit = await t.http.put('/api/v1/ops/catalogue/versions/pv_hdfc_term_v1').set('Authorization', `Bearer ${operatorToken()}`).send({ posEligible: true });
    expect(edit.status).toBe(422);
    expect(edit.body.code).toBe('product_version_locked');
  });

  it('AC-M00-23 after a restart everything is read back from Postgres', async () => {
    await t.close();
    t = await boot();
    const lead = await req('get', `/api/v1/leads/${state.leadId}`);
    expect(lead.status).toBe(200);
    expect(lead.body).toMatchObject({ id: state.leadId, partyId: state.partyId, stage: 'CONVERTED', ownerMemberId: state.sellerId, name: 'Asha Verma', syncState: 'synced' });
    const board = await req('get', '/api/v1/opportunities');
    const items = (board.body.columns as Array<{ items: Array<{ id: string }> }>).flatMap((c) => c.items);
    expect(items.map((i) => i.id)).toContain(state.opportunityId);
  });
});
