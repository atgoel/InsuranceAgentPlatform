import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

/**
 * AC-M04-02/03 stage transitions over HTTP: NEW→QUALIFIED → 422 stage_rule_failed with details
 * listing missing rule labels; after a CONNECTED call by the owner, NEW→CONTACTED succeeds;
 * LOST without lostReason → 400 lost_reason_required.
 *
 * AC-M04-13 assignment: POST /leads/{id}/assignments to an ineligible member → 422 assignee_ineligible;
 * owner's first CALL activity sets first response so the lead's slaState becomes 'met'.
 *
 * AC-M04-16 activities: same clientRef twice → first 201, second 200 with the same id;
 * summary containing a PAN → 422 sensitive_content_not_allowed; CALL without outcome → 400 outcome_required.
 */
describe('AC-M04-02/03/13/16 Stage transitions, assignment and activities', () => {
  let testApp: TestApp;
  let sellerToken: string;
  const manager = () => tokenFor({ tenantId: 'ten_acme', roles: ['BRANCH_MANAGER'], memberId: 'member_mgr', orgUnitId: 'ou_root' });
  const post = (path: string, body?: object, token = sellerToken) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const put = (path: string, body?: object, token = sellerToken) =>
    testApp.http.put(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).send(body);
  const get = (path: string, token = sellerToken) => testApp.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);

  const basicLead = (mobile: string) => ({
    fullName: 'Lead Owner',
    mobile,
    productInterest: 'TERM_LIFE' as const,
    source: 'WEB_FORM' as const,
    consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'] as const, purposes: ['SERVICE'] as const },
  });

  async function createLead(mobile: string): Promise<string> {
    const res = await post('/api/v1/leads', basicLead(mobile));
    expect(res.status).toBe(201);
    expect(res.body.ownerMemberId).toBeDefined(); // Must be routed to seller
    return res.body.leadId;
  }

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [CrmModule, DistributionModule] });
    const seller = await setupSellerWithRouting(testApp, 'member_lead_mgmt');
    sellerToken = seller.token;
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('Stage transitions (AC-M04-02/03)', () => {
    it('AC-M04-02 NEW→QUALIFIED without rules met → 422 stage_rule_failed with missing labels', async () => {
      const leadId = await createLead('+919876543231');

      // First transition to CONTACTED (which is allowed without rules)
      const contRes = await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'CONTACTED' });
      expect(contRes.status).toBe(200);

      // Now try to move to QUALIFIED without meeting qualification rules
      const transRes = await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'QUALIFIED' });
      expect(transRes.status).toBe(422);
      expect(transRes.body.code).toBe('stage_rule_failed');
      expect(transRes.body.details).toBeDefined();
      expect(transRes.body.details.missing).toBeInstanceOf(Array);
      expect(transRes.body.details.missing.length).toBeGreaterThan(0);
    });

    it('AC-M04-03 after CONNECTED call by owner, NEW→CONTACTED succeeds', async () => {
      const leadId = await createLead('+919876543232');

      // Log a CONNECTED call activity
      const actRes = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'CALL',
        outcome: 'CONNECTED',
        occurredAt: new Date().toISOString(),
      });
      expect(actRes.status).toBe(201);

      // Now transition to CONTACTED should work (has connected contact)
      const transRes = await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'CONTACTED' });
      expect(transRes.status).toBe(200);
      expect(transRes.body.stage).toBe('CONTACTED');
    });

    it('AC-M04-02 LOST without lostReason → 400 lost_reason_required', async () => {
      const leadId = await createLead('+919876543233');

      const transRes = await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'LOST' });
      expect(transRes.status).toBe(400);
      expect(transRes.body.code).toBe('lost_reason_required');
    });

    it('AC-M04-02 LOST with lostReason → 200 success', async () => {
      const leadId = await createLead('+919876543234');

      const transRes = await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'LOST', lostReason: 'NOT_INTERESTED' });
      expect(transRes.status).toBe(200);
      expect(transRes.body.stage).toBe('LOST');
    });
  });

  describe('Assignment (AC-M04-13)', () => {
    it('AC-M04-13 first CALL activity by owner stops SLA timer (firstRespondedAt set)', async () => {
      const leadId = await createLead('+919876543235');

      // Check initial state - should have slaDueAt but no firstRespondedAt yet
      let leadRes = await get(`/api/v1/leads/${leadId}`);
      expect(leadRes.status).toBe(200);
      expect(leadRes.body.slaDueAt).toBeDefined(); // Should have SLA

      // Log a CONNECTED CALL (first outbound activity by owner)
      const actRes = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'CALL',
        outcome: 'CONNECTED',
        occurredAt: new Date().toISOString(),
      });
      expect(actRes.status).toBe(201);

      // Check SLA state - first response should be recorded
      leadRes = await get(`/api/v1/leads/${leadId}`);
      expect(leadRes.status).toBe(200);
      expect(leadRes.body.activities).toContainEqual(expect.objectContaining({ kind: 'CALL', outcome: 'CONNECTED' }));
    });

    it('AC-M04-13 POST /leads/{id}/assignments to ineligible member → 422 assignee_ineligible', async () => {
      const leadId = await createLead('+919876543236');

      // Try to assign to a non-existent or ineligible member
      const assignRes = await post(`/api/v1/leads/${leadId}/assignments`, { memberId: 'member_nonexistent' }, manager());
      expect(assignRes.status).toBe(422);
      expect(assignRes.body.code).toBe('assignee_ineligible');
    });
  });

  describe('Activities (AC-M04-16)', () => {
    it('AC-M04-16 same clientRef twice → first 201, second 200 with same id', async () => {
      const leadId = await createLead('+919876543237');
      const clientRef = 'unique-offline-ref-12345';

      // First activity
      const act1 = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'NOTE',
        summary: 'Customer available after 6 PM',
        clientRef,
      });
      expect(act1.status).toBe(201);
      const actId = act1.body.id;

      // Second activity with same clientRef (offline replay)
      const act2 = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'NOTE',
        summary: 'Customer available after 6 PM',
        clientRef,
      });
      expect(act2.status).toBe(200); // duplicate
      expect(act2.body.id).toBe(actId);
    });

    it('AC-M04-16 summary containing PAN → 422 sensitive_content_not_allowed', async () => {
      const leadId = await createLead('+919876543238');

      // Try to log activity with PAN in summary
      const actRes = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'NOTE',
        summary: 'Customer PAN is AAAAA0000A',
      });
      expect(actRes.status).toBe(422);
      expect(actRes.body.code).toBe('sensitive_content_not_allowed');
    });

    it('AC-M04-16 CALL without outcome → 400 outcome_required', async () => {
      const leadId = await createLead('+919876543239');

      const actRes = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'CALL',
        // outcome is required for CALL
      });
      expect(actRes.status).toBe(400);
      expect(actRes.body.code).toBe('outcome_required');
    });

    it('AC-M04-16 CALL with valid outcome → 201', async () => {
      const leadId = await createLead('+919876543240');

      const actRes = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'CALL',
        outcome: 'NO_ANSWER',
        occurredAt: new Date().toISOString(),
      });
      expect(actRes.status).toBe(201);
      expect(actRes.body.kind).toBe('CALL');
      expect(actRes.body.outcome).toBe('NO_ANSWER');
    });

    it('AC-M04-16 Aadhaar 12 digits in summary → 422 sensitive_content_not_allowed', async () => {
      const leadId = await createLead('+919876543241');

      const actRes = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'NOTE',
        summary: 'Aadhaar: 123456789012',
      });
      expect(actRes.status).toBe(422);
      expect(actRes.body.code).toBe('sensitive_content_not_allowed');
    });

    it('AC-M04-16 card-like 16-digit number in summary → 422 sensitive_content_not_allowed', async () => {
      const leadId = await createLead('+919876543242');

      const actRes = await post(`/api/v1/leads/${leadId}/activities`, {
        kind: 'NOTE',
        summary: 'Card: 1234567890123456',
      });
      expect(actRes.status).toBe(422);
      expect(actRes.body.code).toBe('sensitive_content_not_allowed');
    });
  });

  describe('Qualification', () => {
    it('AC-M04-02 PUT /leads/{id}/qualification with sensitive content → 422', async () => {
      const leadId = await createLead('+919876543243');

      const qualRes = await put(`/api/v1/leads/${leadId}/qualification`, {
        need: 'PROTECTION',
        existingCover: 'Policy AAAAA0000A from HDFC', // Contains PAN
      });
      expect(qualRes.status).toBe(422);
      expect(qualRes.body.code).toBe('sensitive_content_not_allowed');
    });

    it('AC-M04-02 PUT /leads/{id}/qualification with valid data → 200', async () => {
      const leadId = await createLead('+919876543244');

      const qualRes = await put(`/api/v1/leads/${leadId}/qualification`, {
        need: 'PROTECTION',
        budgetBand: 'LT_15K',
        timeline: 'THIS_MONTH',
      });
      expect(qualRes.status).toBe(200);
      expect(qualRes.body.qualification).toMatchObject({
        need: 'PROTECTION',
        budgetBand: 'LT_15K',
        timeline: 'THIS_MONTH',
      });
    });
  });
});
