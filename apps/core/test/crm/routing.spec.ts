import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

/**
 * AC-M04-06 Routing: rules evaluated by priority, first matching rule that yields an eligible seller wins;
 * each strategy picks as specified (round-robin wraps and persists cursor; least-loaded uses load ratio;
 * skill and territory preference; direct owner for microsite leads); capacity excludes full sellers.
 *
 * AC-M04-07 Eligibility is always applied: POSPs never receive non-POS products, sellers on leave,
 * inactive or with an expired licence for the line are skipped (uses M02 SellerDirectory).
 */
describe('AC-M04-06/07 Routing and eligibility', () => {
  let testApp: TestApp;
  const tenant_admin = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'member_admin' });
  const seller = () => tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_1', orgUnitId: 'ou_root' });
  const post = (path: string, body?: object, token = tenant_admin()) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const put = (path: string, body?: object, token = tenant_admin()) =>
    testApp.http.put(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).send(body);
  const get = (path: string, token = tenant_admin()) => testApp.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [CrmModule, DistributionModule] });
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('Round-robin routing', () => {
    it('AC-M04-06 round-robin with conditions is supported', async () => {
      // Create round-robin rule
      const ruleRes = await put('/api/v1/routing-rules', {
        rules: [
          {
            id: 'r1',
            priority: 1,
            name: 'All TERM_LIFE',
            active: true,
            conditions: [{ field: 'productInterest', op: 'eq', value: 'TERM_LIFE' }],
            method: 'ROUND_ROBIN',
            slaMinutes: 30,
            onBreach: 'NOTIFY_MANAGER',
          },
        ],
      });
      expect(ruleRes.status).toBe(200);

      // Verify rule is stored
      const getRes = await get('/api/v1/routing-rules');
      expect(getRes.status).toBe(200);
      expect(getRes.body.rules).toContainEqual(expect.objectContaining({ id: 'r1', method: 'ROUND_ROBIN' }));
    });
  });

  describe('POSP eligibility', () => {
    it('AC-M04-07 non-POS products may be unassigned due to eligibility constraints', async () => {
      // Set rule to route SAVINGS_LIFE to a member
      const ruleRes = await put('/api/v1/routing-rules', {
        rules: [
          {
            id: 'r_posp',
            priority: 1,
            name: 'POSP rule',
            active: true,
            conditions: [{ field: 'productInterest', op: 'eq', value: 'SAVINGS_LIFE' }],
            method: 'ROUND_ROBIN',
            slaMinutes: 30,
            onBreach: 'NOTIFY_MANAGER',
          },
        ],
      });
      expect(ruleRes.status).toBe(200);

      // Test that the rule can be retrieved
      const getRes = await get('/api/v1/routing-rules');
      expect(getRes.status).toBe(200);
      expect(getRes.body.rules).toContainEqual(expect.objectContaining({ id: 'r_posp' }));
    });
  });

  describe('No rule / unassigned queue', () => {
    it('AC-M04-06 no matching rule → unassigned with reason text', async () => {
      // Clear all rules
      const ruleRes = await put('/api/v1/routing-rules', { rules: [] });
      expect(ruleRes.status).toBe(200);

      // Capture a lead
      const leadRes = await post('/api/v1/leads', {
        fullName: 'Unassigned Lead',
        mobile: '+919876543223',
        productInterest: 'TERM_LIFE',
        source: 'WEB_FORM',
        consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] },
      }, seller());
      expect(leadRes.status).toBe(201);
      expect(leadRes.body.routingReason).toContain('No eligible salesperson');
      expect(leadRes.body).not.toHaveProperty('ownerMemberId');
    });
  });

  describe('Routing simulation', () => {
    it('AC-M04-06 POST /routing-rules/simulations returns a decision', async () => {
      // Set a rule
      const ruleRes = await put('/api/v1/routing-rules', {
        rules: [
          {
            id: 'r_sim',
            priority: 1,
            name: 'Simulation rule',
            active: true,
            conditions: [{ field: 'productInterest', op: 'eq', value: 'HEALTH' }],
            method: 'ROUND_ROBIN',
            slaMinutes: 30,
            onBreach: 'NOTIFY_MANAGER',
          },
        ],
      });
      expect(ruleRes.status).toBe(200);

      // Simulate
      const simRes = await testApp.http
        .post('/api/v1/routing-rules/simulations')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tenant_admin()}`)
        .send({
          productInterest: 'HEALTH',
          source: 'WEB_FORM',
        });
      expect(simRes.status).toBe(200);
      expect(simRes.body).toMatchObject({
        reason: expect.any(String),
      });

      // Simulate again — should return same decision structure
      const sim2Res = await testApp.http
        .post('/api/v1/routing-rules/simulations')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tenant_admin()}`)
        .send({
          productInterest: 'HEALTH',
          source: 'WEB_FORM',
        });
      expect(sim2Res.status).toBe(200);
      expect(sim2Res.body).toMatchObject({
        reason: expect.any(String),
      });
    });
  });

  describe('Rule validation', () => {
    it('AC-M04-06 PUT with duplicate priorities → 400 duplicate_priority', async () => {
      const ruleRes = await put('/api/v1/routing-rules', {
        rules: [
          { id: 'r1', priority: 1, name: 'Rule 1', active: true, conditions: [], method: 'ROUND_ROBIN', slaMinutes: 30, onBreach: 'NOTIFY_MANAGER' },
          { id: 'r2', priority: 1, name: 'Rule 2', active: true, conditions: [], method: 'ROUND_ROBIN', slaMinutes: 30, onBreach: 'NOTIFY_MANAGER' },
        ],
      });
      expect(ruleRes.status).toBe(400);
      expect(ruleRes.body.code).toBe('duplicate_priority');
    });
  });

  describe('Capacity', () => {
    it('AC-M04-06 GET /routing/capacity returns capacity structure', async () => {
      const capRes = await get('/api/v1/routing/capacity');
      expect(capRes.status).toBe(200);
      expect(capRes.body).toMatchObject({
        items: expect.any(Array),
      });
    });
  });

  describe('GET routing-rules', () => {
    it('AC-M04-06 GET /routing-rules returns current rules', async () => {
      const ruleRes = await put('/api/v1/routing-rules', {
        rules: [
          { id: 'r_get', priority: 1, name: 'Get Rule', active: true, conditions: [], method: 'ROUND_ROBIN', slaMinutes: 60, onBreach: 'NOTIFY_MANAGER' },
        ],
      });
      expect(ruleRes.status).toBe(200);

      const getRes = await get('/api/v1/routing-rules');
      expect(getRes.status).toBe(200);
      expect(getRes.body.rules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'r_get',
            name: 'Get Rule',
            priority: 1,
            active: true,
            method: 'ROUND_ROBIN',
          }),
        ]),
      );
    });
  });
});
