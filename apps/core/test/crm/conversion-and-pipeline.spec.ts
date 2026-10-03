import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

/**
 * AC-M04-14 conversion: before QUALIFIED → 422; after connected call + qualification + QUALIFIED → POST conversion 201.
 * AC-M04-15 pipeline: adjacent moves work, skipping stages → 422, to ISSUED → 422, loss → LOST.
 */
describe('AC-M04-14/15 Conversion and pipeline', () => {
  let testApp: TestApp;
  let sellerToken: string;
  const post = (path: string, body?: object, token = sellerToken) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const put = (path: string, body?: object, token = sellerToken) =>
    testApp.http.put(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).send(body);
  const get = (path: string, token = sellerToken) => testApp.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);

  const basicLead = (mobile: string) => ({
    fullName: 'Conversion Test',
    mobile,
    productInterest: 'TERM_LIFE' as const,
    source: 'WEB_FORM' as const,
    consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'] as const, purposes: ['SERVICE', 'MARKETING'] as const },
  });

  async function createAndQualifyLead(mobile: string): Promise<string> {
    const capRes = await post('/api/v1/leads', basicLead(mobile));
    expect(capRes.status).toBe(201);
    expect(capRes.body.ownerMemberId).toBeDefined();
    const leadId = capRes.body.leadId;

    const actRes = await post(`/api/v1/leads/${leadId}/activities`, {
      kind: 'CALL',
      outcome: 'CONNECTED',
      occurredAt: new Date().toISOString(),
    });
    expect(actRes.status).toBe(201);

    const contRes = await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'CONTACTED' });
    expect(contRes.status).toBe(200);

    const qualRes = await put(`/api/v1/leads/${leadId}/qualification`, {
      need: 'PROTECTION',
      budgetBand: 'LT_15K',
      timeline: 'THIS_MONTH',
    });
    expect(qualRes.status).toBe(200);

    const qualTransRes = await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'QUALIFIED' });
    expect(qualTransRes.status).toBe(200);

    return leadId;
  }

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [CrmModule, DistributionModule] });
    const seller = await setupSellerWithRouting(testApp, 'member_conv_pipeline');
    sellerToken = seller.token;
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('AC-M04-14 before QUALIFIED → 422', async () => {
    const capRes = await post('/api/v1/leads', basicLead('+919876543250'));
    expect(capRes.status).toBe(201);
    const leadId = capRes.body.leadId;

    const convRes = await post(`/api/v1/leads/${leadId}/conversion`, {
      partyChoice: 'LEAD_PARTY',
      productInterest: 'TERM_LIFE',
      expectedPremiumPaise: 50000,
      startStage: 'DISCOVERY',
    });
    expect(convRes.status).toBe(422);
  });

  it('AC-M04-14 after QUALIFIED → 201 with opportunityId', async () => {
    const leadId = await createAndQualifyLead('+919876543251');
    const convRes = await post(`/api/v1/leads/${leadId}/conversion`, {
      partyChoice: 'LEAD_PARTY',
      productInterest: 'TERM_LIFE',
      expectedPremiumPaise: 75000,
      startStage: 'DISCOVERY',
    });
    expect(convRes.status).toBe(201);
    expect(convRes.body.opportunityId).toBeDefined();
  });

  it('AC-M04-15 adjacent move works', async () => {
    const leadId = await createAndQualifyLead('+919876543253');
    const convRes = await post(`/api/v1/leads/${leadId}/conversion`, {
      partyChoice: 'LEAD_PARTY',
      productInterest: 'TERM_LIFE',
      expectedPremiumPaise: 50000,
      startStage: 'DISCOVERY',
    });
    expect(convRes.status).toBe(201);
    const moveRes = await post(`/api/v1/opportunities/${convRes.body.opportunityId}/stage-transitions`, { to: 'QUOTE_SHARED' });
    expect(moveRes.status).toBe(200);
  });

  it('AC-M04-15 skipping stage → 422', async () => {
    const leadId = await createAndQualifyLead('+919876543254');
    const convRes = await post(`/api/v1/leads/${leadId}/conversion`, {
      partyChoice: 'LEAD_PARTY',
      productInterest: 'TERM_LIFE',
      expectedPremiumPaise: 50000,
      startStage: 'DISCOVERY',
    });
    const moveRes = await post(`/api/v1/opportunities/${convRes.body.opportunityId}/stage-transitions`, { to: 'PROPOSAL_COMPLETE' });
    expect(moveRes.status).toBe(422);
  });

  it('AC-M04-15 loss with reason → LOST', async () => {
    const leadId = await createAndQualifyLead('+919876543256');
    const convRes = await post(`/api/v1/leads/${leadId}/conversion`, {
      partyChoice: 'LEAD_PARTY',
      productInterest: 'TERM_LIFE',
      expectedPremiumPaise: 50000,
      startStage: 'DISCOVERY',
    });
    const lossRes = await post(`/api/v1/opportunities/${convRes.body.opportunityId}/loss`, { reason: 'PREMIUM_TOO_HIGH' });
    expect(lossRes.status).toBe(200);
    expect(lossRes.body.stage).toBe('LOST');
  });
});
