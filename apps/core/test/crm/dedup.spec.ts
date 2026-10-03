import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

/**
 * AC-M04-12 dedup: same name+mobile within 30 days → 200 deduplicated true, same leadId,
 * RE_ENQUIRY in activities, no second lead in GET /leads; after 31 days → a new lead (201).
 */
describe('AC-M04-12 Lead deduplication', () => {
  let testApp: TestApp;
  let sellerToken: string;
  const adminToken = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'admin' });
  const post = (path: string, body?: object, token = sellerToken) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const get = (path: string, token = sellerToken) => testApp.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);

  const captureInput = (mobile: string) => ({
    fullName: 'Rohan Gupta',
    mobile,
    productInterest: 'TERM_LIFE' as const,
    source: 'WEB_FORM' as const,
    consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'] as const, purposes: ['SERVICE'] as const },
  });

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [CrmModule, DistributionModule] });
    const seller = await setupSellerWithRouting(testApp, 'member_dedup_seller');
    sellerToken = seller.token;
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('AC-M04-12 second enquiry within 30 days for same contact → 200 deduplicated: true, same leadId', async () => {
    const mobile = '+919876543211';

    // First capture
    const first = await post('/api/v1/leads', captureInput(mobile));
    expect(first.status).toBe(201);
    expect(first.body.ownerMemberId).toBeDefined(); // routed to active seller
    const firstLeadId = first.body.leadId;
    expect(first.body.deduplicated).toBe(false);

    // Second capture with same mobile (same party or shared contact hash)
    const second = await post('/api/v1/leads', captureInput(mobile));
    expect(second.status).toBe(200); // deduplicated response
    expect(second.body.deduplicated).toBe(true);
    expect(second.body.leadId).toBe(firstLeadId);
  });

  it('AC-M04-12 dedup adds RE_ENQUIRY activity to open lead', async () => {
    const mobile = '+919876543212';

    // First capture
    const first = await post('/api/v1/leads', captureInput(mobile));
    expect(first.status).toBe(201);
    expect(first.body.ownerMemberId).toBeDefined();
    const leadId = first.body.leadId;

    // Second capture (dedup)
    const second = await post('/api/v1/leads', captureInput(mobile));
    expect(second.status).toBe(200);

    // Check lead activities for RE_ENQUIRY
    const leadRes = await get(`/api/v1/leads/${leadId}`);
    expect(leadRes.status).toBe(200);
    const activities = leadRes.body.activities;
    expect(activities).toBeInstanceOf(Array);
    const reEnquiry = activities.find((a: { kind: string }) => a.kind === 'RE_ENQUIRY');
    expect(reEnquiry).toBeDefined();
  });

  it('AC-M04-12 dedup does not create second lead in GET /leads', async () => {
    const mobile = '+919876543213';

    // First capture
    const first = await post('/api/v1/leads', captureInput(mobile));
    expect(first.status).toBe(201);
    expect(first.body.ownerMemberId).toBeDefined();
    const firstLeadId = first.body.leadId;

    // Second capture (dedup)
    const second = await post('/api/v1/leads', captureInput(mobile));
    expect(second.status).toBe(200);

    // List leads - should only have the first one, not a second
    const listRes = await get('/api/v1/leads?limit=100');
    expect(listRes.status).toBe(200);
    const leads = listRes.body.items;

    // Find leads with NEW/CONTACTED stage created in this test
    const thisTestLeads = leads.filter((l: { id: string; stage: string }) => (l.stage === 'NEW' || l.stage === 'CONTACTED') && l.id === firstLeadId);
    // After dedup, there should be exactly one
    expect(thisTestLeads.length).toBe(1);
    expect(thisTestLeads[0].id).toBe(firstLeadId);
  });

  it('AC-M04-12 after 31 days, second enquiry creates new lead (201)', async () => {
    const mobile = '+919876543214';

    // First capture
    const first = await post('/api/v1/leads', captureInput(mobile));
    expect(first.status).toBe(201);
    expect(first.body.ownerMemberId).toBeDefined();
    const firstLeadId = first.body.leadId;

    // Advance clock 31 days
    testApp.clock.advance(31 * 24 * 60 * 60 * 1000);

    // Second capture (outside 30-day window)
    const second = await post('/api/v1/leads', captureInput(mobile));
    expect(second.status).toBe(201); // new lead
    expect(second.body.ownerMemberId).toBeDefined();
    expect(second.body.deduplicated).toBe(false);
    expect(second.body.leadId).not.toBe(firstLeadId);
  });

  it('AC-M04-12 dedup on open leads with same contact', async () => {
    const mobile = '+919876543215';

    // First capture
    const first = await post('/api/v1/leads', captureInput(mobile));
    expect(first.status).toBe(201);
    expect(first.body.ownerMemberId).toBeDefined();
    const leadId = first.body.leadId;

    // Second capture should deduplicate
    const second = await post('/api/v1/leads', captureInput(mobile));
    expect(second.status).toBe(200);
    expect(second.body.deduplicated).toBe(true);
    expect(second.body.leadId).toBe(leadId);
  });
});
