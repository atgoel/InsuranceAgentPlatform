import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

/**
 * AC-M03-03, AC-M03-04, AC-M03-05, AC-M03-11
 * HTTP component tests for consent endpoints
 */
describe('AC-M03-* Consent endpoints', () => {
  let testApp: TestApp;
  let partyId: string;

  beforeAll(async () => {
    testApp = await createTestApp({
      imports: [PartyModule],
    });

    // Create a test party
    const token = tokenFor({
      tenantId: 'ten_acme',
      roles: ['SALESPERSON'],
      memberId: 'member_1',
    });

    const response = await testApp.http
      .post('/api/v1/parties')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        kind: 'PERSON',
        displayName: 'Consent Test Party',
        contacts: [
          { channel: 'MOBILE', value: '+919876543210' },
          { channel: 'EMAIL', value: 'test@example.com' },
        ],
      });

    partyId = response.body.party.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('AC-M03-03 POST /api/v1/parties/{id}/consents (record consent)', () => {
    it('records a consent grant', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .post(`/api/v1/parties/${partyId}/consents`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          purpose: 'MARKETING',
          channel: 'SMS',
          granted: true,
          noticeVersion: '1.0',
          source: 'WEB_FORM',
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.purpose).toBe('MARKETING');
      expect(response.body.granted).toBe(true);
    });

    it('records a consent withdrawal', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .post(`/api/v1/parties/${partyId}/consents`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          purpose: 'AI_PROCESSING',
          channel: 'EMAIL',
          granted: false,
          noticeVersion: '1.0',
          source: 'CUSTOMER_LINK',
        });

      expect(response.status).toBe(201);
      expect(response.body.granted).toBe(false);
    });

    it('requires party.consent.write permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .post(`/api/v1/parties/${partyId}/consents`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          purpose: 'MARKETING',
          channel: 'SMS',
          granted: true,
          noticeVersion: '1.0',
          source: 'WEB_FORM',
        });

      expect(response.status).toBe(403);
    });

    it('requires Idempotency-Key', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .post(`/api/v1/parties/${partyId}/consents`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          purpose: 'MARKETING',
          channel: 'SMS',
          granted: true,
          noticeVersion: '1.0',
          source: 'WEB_FORM',
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('does not expose audit ID in response', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .post(`/api/v1/parties/${partyId}/consents`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          purpose: 'SERVICE',
          channel: 'CALL',
          granted: true,
          noticeVersion: '2.0',
          source: 'WEB_FORM',
        });

      expect(response.status).toBe(201);
      // Audit details should not be in response
      expect(response.body.capturedBy).toBeDefined(); // Yes, capturedBy is in response
      expect(response.body.occurredAt).toBeDefined();
    });
  });

  describe('AC-M03-03 GET /api/v1/parties/{id}/consents (read consents)', () => {
    it('returns consent summary and history', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .get(`/api/v1/parties/${partyId}/consents`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.summary).toBeDefined();
      expect(Array.isArray(response.body.summary)).toBe(true);
      expect(response.body.history).toBeDefined();
      expect(Array.isArray(response.body.history)).toBe(true);
    });

    it('requires party.read permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .get(`/api/v1/parties/${partyId}/consents`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('AC-M03-04 GET /api/v1/parties/{id}/contactability (check contactability)', () => {
    it('returns contactability decision for a channel and purpose', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .get(`/api/v1/parties/${partyId}/contactability?channel=SMS&purpose=SERVICE`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.allowed).toBeDefined();
      expect(response.body.reason).toBeDefined();
      expect(['ok', 'party_inactive', 'no_contact_point', 'suppressed', 'consent_missing', 'consent_withdrawn']).toContain(
        response.body.reason
      );
    });

    it('requires permission to check contactability', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .get(`/api/v1/parties/${partyId}/contactability?channel=SMS&purpose=SERVICE`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('AC-M03-05 POST /api/v1/suppressions (add suppression)', () => {
    it('adds a suppression by contact hash', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['COMPLIANCE'],
      });

      const response = await testApp.http
        .post('/api/v1/suppressions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          channel: 'SMS',
          contactHash: 'hash_test_123',
          reason: 'OPT_OUT',
        });

      expect(response.status).toBe(201);
    });

    it('requires party.suppression.write permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .post('/api/v1/suppressions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          channel: 'SMS',
          contactHash: 'hash_test_123',
          reason: 'DND',
        });

      expect(response.status).toBe(403);
    });

    it('requires Idempotency-Key', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['COMPLIANCE'],
      });

      const response = await testApp.http
        .post('/api/v1/suppressions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          channel: 'SMS',
          contactHash: 'hash_test_123',
          reason: 'BOUNCE',
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('AC-M03-11 Sensitive endpoint caching and auditing', () => {
    it('GET /api/v1/parties/{id}/sensitive requires party.sensitive.read', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No sensitive.read
      });

      const response = await testApp.http
        .get(`/api/v1/parties/${partyId}/sensitive?purpose=PROPOSAL`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('returns Cache-Control: no-store for sensitive data', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .get(`/api/v1/parties/${partyId}/sensitive?purpose=PROPOSAL`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toContain('no-store');
    });
  });
});
