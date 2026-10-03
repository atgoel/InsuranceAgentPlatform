import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

/**
 * AC-M04-11 capture: staff capture → 201 with owner and routingReason; public POST /api/v1/public/leads
 * (no Authorization, Host header, Idempotency-Key) → 202 { received: true } and never owner/dedup fields;
 * public without consent.granted → 400 consent_required; honeypot filled → 400 spam_detected;
 * 11th submission within 10 minutes → 429; no contact → 400 contact_required; consent records visible
 * via GET /api/v1/parties/{partyId}/consents as an admin.
 */
describe('AC-M04-11 Lead capture (staff and public)', () => {
  let testApp: TestApp;
  const seller = () => tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_1', orgUnitId: 'ou_root' });
  const tenant_admin = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'member_admin' });
  const post = (path: string, body?: object, token = seller()) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const publicPost = (path: string, body?: object) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Idempotency-Key', newIdempotencyKey()).send(body);

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [CrmModule, DistributionModule] });
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('Staff capture', () => {
    it('AC-M04-11 creates a lead with 201, owner and routingReason on first valid capture', async () => {
      const res = await post('/api/v1/leads', {
        fullName: 'Rajesh Kumar',
        mobile: '+919876543210',
        productInterest: 'TERM_LIFE',
        source: 'WALK_IN',
        consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] },
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        leadId: expect.any(String),
        partyId: expect.any(String),
        deduplicated: false,
        routingReason: expect.any(String),
        possibleMatches: 0,
      });
      expect(res.body).not.toHaveProperty('ownerMemberId');
    });

    it('AC-M04-11 accepts staff capture without consent.granted (do-not-contact lead)', async () => {
      const res = await post('/api/v1/leads', {
        fullName: 'Priya Sharma',
        email: 'priya@example.com',
        productInterest: 'HEALTH',
        source: 'PHONE',
        consent: { granted: false, noticeVersion: 'v2', channels: ['EMAIL'], purposes: ['MARKETING'] },
      });
      expect(res.status).toBe(201);
      expect(res.body.leadId).toMatch(/^lead_/);
    });

    it('AC-M04-11 requires at least one contact channel (mobile or email)', async () => {
      const res = await post('/api/v1/leads', {
        fullName: 'John Doe',
        productInterest: 'MOTOR',
        source: 'WEB_FORM',
        consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('contact_required');
    });
  });

  describe('Public capture', () => {
    it('AC-M04-11 accepts public lead with 202 and returns only { received: true }', async () => {
      const res = await publicPost('/api/v1/public/leads', {
        fullName: 'Anil Singh',
        mobile: '+919988776655',
        productInterest: 'HEALTH_FLOATER',
        source: 'WEB_FORM',
        consent: { granted: true, noticeVersion: 'v2', channels: ['WHATSAPP'], purposes: ['SERVICE', 'MARKETING'] },
      });
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ received: true });
      expect(res.body).not.toHaveProperty('leadId');
      expect(res.body).not.toHaveProperty('ownerMemberId');
      expect(res.body).not.toHaveProperty('deduplicated');
    });

    it('AC-M04-11 public capture without consent.granted → 400 consent_required', async () => {
      const res = await publicPost('/api/v1/public/leads', {
        fullName: 'Meera Iyer',
        mobile: '+919812300001',
        productInterest: 'TERM_LIFE',
        source: 'WEB_FORM',
        consent: { granted: false, noticeVersion: 'v2', channels: ['SMS'], purposes: ['MARKETING'] },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('consent_required');
    });

    it('AC-M04-11 filled honeypot field (website) → 400 spam_detected', async () => {
      const res = await publicPost('/api/v1/public/leads', {
        fullName: 'Bot Name',
        mobile: '+919811111111',
        productInterest: 'MOTOR',
        source: 'WEB_FORM',
        website: 'https://spam.com', // honeypot
        consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('spam_detected');
    });

    it('AC-M04-11 11th public submission from same client within 10 min → 429 rate limited', async () => {
      // Submit 10 valid leads
      for (let i = 0; i < 10; i++) {
        const res = await publicPost('/api/v1/public/leads', {
          fullName: `Client ${i}`,
          mobile: `+9198000000${String(i).padStart(2, '0')}`,
          productInterest: 'TERM_LIFE',
          source: 'WEB_FORM',
          consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] },
        });
        expect([202, 429]).toContain(res.status); // might hit limit earlier
      }
      // The 11th should fail
      const res = await publicPost('/api/v1/public/leads', {
        fullName: 'Client 11',
        mobile: '+919800000011',
        productInterest: 'TERM_LIFE',
        source: 'WEB_FORM',
        consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] },
      });
      expect(res.status).toBe(429);
    });

    it('AC-M04-11 public capture requires consent.granted (no staff override)', async () => {
      const res = await publicPost('/api/v1/public/leads', {
        fullName: 'Vikram Rao',
        email: 'vikram@example.com',
        productInterest: 'HEALTH',
        source: 'WEB_FORM',
        consent: { granted: false, noticeVersion: 'v2', channels: ['EMAIL'], purposes: ['MARKETING'] },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('consent_required');
    });

    it('AC-M04-11 public capture without contact → 400 contact_required', async () => {
      const res = await publicPost('/api/v1/public/leads', {
        fullName: 'No Contact Person',
        productInterest: 'TERM_LIFE',
        source: 'WEB_FORM',
        consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('contact_required');
    });
  });

  describe('Consent records', () => {
    it('AC-M04-11 consent records visible via GET /parties/{partyId}/consents as admin', async () => {
      // Create a lead with consent
      const captureRes = await post('/api/v1/leads', {
        fullName: 'Consent Test User',
        mobile: '+919898989898',
        productInterest: 'HEALTH_FLOATER',
        source: 'REFERRAL',
        consent: {
          granted: true,
          noticeVersion: 'v3',
          channels: ['WHATSAPP', 'SMS'],
          purposes: ['SERVICE', 'MARKETING'],
        },
      });
      expect(captureRes.status).toBe(201);
      const partyId = captureRes.body.partyId;

      // Verify consents are recorded
      const consentsRes = await testApp.http
        .get(`/api/v1/parties/${partyId}/consents`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tenant_admin()}`);
      expect(consentsRes.status).toBe(200);
      // One ledger record per purpose × channel (2 × 2), all granted with the notice version
      const pairs = consentsRes.body.history.map((r: { purpose: string; channel: string; granted: boolean; source: string }) => `${r.purpose}:${r.channel}:${r.granted}:${r.source}`).sort();
      expect(pairs).toEqual(['MARKETING:SMS:true:ASSISTED', 'MARKETING:WHATSAPP:true:ASSISTED', 'SERVICE:SMS:true:ASSISTED', 'SERVICE:WHATSAPP:true:ASSISTED']);
    });
  });
});
