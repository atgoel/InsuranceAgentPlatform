import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { OUTBOX_RELAY } from '../../src/kernel/tokens';
import { OutboxRelay } from '../../src/kernel/outbox/outbox-relay';
import { FakeTwentyClient } from '../../src/modules/crm/infrastructure/twenty/fake-twenty.client';
import { createTestApp, TestApp } from '../support/test-app';
import { customFieldOverrides } from '../support/custom-field-defs';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

const HOST = 'acme.iap.test';
const WS = 'ws_ten_acme';

// Distinctive values: P0 (campaign_code, review_flag, segment), P1 (source_note, rider_note, occupation), P2 (money).
const LEAD_VALUES = { campaign_code: 'ZXQ-CAMPAIGN-77', source_note: 'zxq met at the expo stall', budget_paise: 2_571_309 };
const OPP_VALUES = { rider_note: 'zxq critical illness rider', sum_assured_paise: 10_482_117, review_flag: true };
const PARTY_VALUES = { segment: 'HNI', occupation: 'zxq architect', income_paise: 91_337_551 };
const NEEDLES = [
  'ZXQ-CAMPAIGN-77',
  'zxq met at the expo stall',
  '2571309',
  'zxq critical illness rider',
  '10482117',
  'zxq architect',
  '91337551',
  'zxq',
];

/** AC-CR001-05 (M04 part): P0/P1/P2 custom-field values never reach Twenty projections or logs. */
describe('AC-CR001-05 custom fields never leave Core', () => {
  let t: TestApp;
  const admin = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'member_admin' });
  const auth = <R extends { set(k: string, v: string): R }>(r: R) => r.set('Host', HOST).set('Authorization', `Bearer ${admin()}`);
  const twenty = () => t.app.get(FakeTwentyClient);
  const relay = () => t.app.get<OutboxRelay>(OUTBOX_RELAY).relayOnce();
  const call = (method: 'post' | 'put' | 'get', path: string) => auth(t.http[method](path)).set('Idempotency-Key', newIdempotencyKey());

  beforeEach(async () => {
    t = await createTestApp({ imports: [CrmModule, DistributionModule], overrides: customFieldOverrides() });
  });
  afterEach(async () => t.close());

  it('AC-CR001-05 lead, opportunity and party values are stored, yet no Twenty payload or log line contains any of them', async () => {
    const captured = await call('post', '/api/v1/leads').send({
      fullName: 'Asha Verma',
      mobile: '+919876500041',
      productInterest: 'TERM_LIFE',
      source: 'WEB_FORM',
      customFields: LEAD_VALUES,
      consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] },
    });
    expect(captured.status).toBe(201);
    const { leadId, partyId } = captured.body as { leadId: string; partyId: string };

    await call('post', `/api/v1/leads/${leadId}/activities`).send({
      kind: 'CALL',
      outcome: 'CONNECTED',
      occurredAt: new Date().toISOString(),
    });
    expect((await call('post', `/api/v1/leads/${leadId}/stage-transitions`).send({ to: 'CONTACTED' })).status).toBe(200);
    await call('put', `/api/v1/leads/${leadId}/qualification`).send({ need: 'PROTECTION', budgetBand: 'LT_15K', timeline: 'THIS_MONTH' });
    expect((await call('post', `/api/v1/leads/${leadId}/stage-transitions`).send({ to: 'QUALIFIED' })).status).toBe(200);
    const conv = await call('post', `/api/v1/leads/${leadId}/conversion`).send({
      partyChoice: 'LEAD_PARTY',
      productInterest: 'TERM_LIFE',
      expectedPremiumPaise: 50000,
      startStage: 'DISCOVERY',
    });
    expect(conv.status).toBe(201);
    const oppId = conv.body.opportunityId as string;

    const oppVersion = (await call('get', `/api/v1/opportunities/${oppId}`)).body.version;
    const oppPut = await call('put', `/api/v1/opportunities/${oppId}/custom-fields`)
      .set('If-Match', `"v${oppVersion}"`)
      .send({ customFields: OPP_VALUES });
    expect(oppPut.status).toBe(200);
    const party = await call('get', `/api/v1/parties/${partyId}`);
    const partyPut = await call('put', `/api/v1/parties/${partyId}/custom-fields`)
      .set('If-Match', `"v${party.body.version}"`)
      .send({ customFields: PARTY_VALUES });
    expect(partyPut.status).toBe(200);
    const leadVersion = (await call('get', `/api/v1/leads/${leadId}`)).body.version;
    const leadPut = await call('put', `/api/v1/leads/${leadId}/custom-fields`)
      .set('If-Match', `"v${leadVersion}"`)
      .send({ customFields: LEAD_VALUES });
    expect(leadPut.status).toBe(200);

    // The values are really stored (so the absence below is not vacuous).
    expect((await call('get', `/api/v1/leads/${leadId}`)).body.customFields).toEqual(LEAD_VALUES);
    expect((await call('get', `/api/v1/opportunities/${oppId}`)).body.customFields).toEqual(OPP_VALUES);
    expect((await call('get', `/api/v1/parties/${partyId}`)).body.customFields).toEqual(PARTY_VALUES);

    await relay();
    const projected = [...twenty().records.values()];
    expect(projected.filter((r) => r.object === 'lead')).toHaveLength(1);
    expect(projected.filter((r) => r.object === 'opportunity')).toHaveLength(1);
    expect(projected.filter((r) => r.object === 'person')).toHaveLength(1);
    expect(projected.every((r) => r.workspaceId === WS)).toBe(true);
    const payloads = JSON.stringify(projected);
    const logs = JSON.stringify(t.logs.records);
    for (const needle of NEEDLES) {
      expect(payloads).not.toContain(needle);
      expect(logs).not.toContain(needle);
    }
    expect(Object.keys(twenty().find('lead', leadId)?.fields ?? {}).sort()).toEqual([
      'core_id',
      'core_party_id',
      'created_at',
      'owner_core_member_id',
      'product_interest',
      'sla_due_at',
      'source',
      'stage',
      'temperature',
    ]);
  });
});
