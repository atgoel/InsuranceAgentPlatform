import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

/**
 * AC-M03-12 Household endpoints
 */
describe('AC-M03-12 Household endpoints', () => {
  let testApp: TestApp;
  let headPartyId: string;
  let memberPartyId: string;

  beforeAll(async () => {
    testApp = await createTestApp({
      imports: [PartyModule],
    });

    const token = tokenFor({
      tenantId: 'ten_acme',
      roles: ['SALESPERSON'],
      memberId: 'member_1',
    });

    // Create two parties for household
    const resp1 = await testApp.http
      .post('/api/v1/parties')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        kind: 'PERSON',
        displayName: 'John Doe',
        contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
      });

    headPartyId = resp1.body.party.id;

    const resp2 = await testApp.http
      .post('/api/v1/parties')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        kind: 'PERSON',
        displayName: 'Jane Doe',
        contacts: [{ channel: 'MOBILE', value: '+919876543211' }],
      });

    memberPartyId = resp2.body.party.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('POST /api/v1/households (create household)', () => {
    it('creates a household with head party', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const response = await testApp.http
        .post('/api/v1/households')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          name: 'Doe Family',
          headPartyId,
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('Doe Family');
      expect(response.body.members).toBeDefined();
      expect(response.body.members.length).toBeGreaterThan(0);
    });

    it('requires party.write permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .post('/api/v1/households')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          name: 'Doe Family',
          headPartyId,
        });

      expect(response.status).toBe(403);
    });

    it('requires Idempotency-Key', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const response = await testApp.http
        .post('/api/v1/households')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Family',
          headPartyId,
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/v1/households/{id}/members (add member)', () => {
    it('adds a member to the household', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create household first
      const householdResp = await testApp.http
        .post('/api/v1/households')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          name: 'Test Household',
          headPartyId,
        });

      const householdId = householdResp.body.id;

      const response = await testApp.http
        .post(`/api/v1/households/${householdId}/members`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          partyId: memberPartyId,
          relation: 'SPOUSE',
        });

      expect(response.status).toBe(201);
      expect(response.body.members).toBeDefined();
      const member = response.body.members.find((m: any) => m.partyId === memberPartyId);
      expect(member).toBeDefined();
      expect(member.relation).toBe('SPOUSE');
    });

    it('requires party.write permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .post('/api/v1/households/household_1/members')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          partyId: memberPartyId,
          relation: 'SPOUSE',
        });

      expect(response.status).toBe(403);
    });

    it('requires Idempotency-Key', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const response = await testApp.http
        .post('/api/v1/households/household_1/members')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          partyId: memberPartyId,
          relation: 'SPOUSE',
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('DELETE /api/v1/households/{id}/members/{partyId} (remove member)', () => {
    it('removes a member from the household', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create household
      const householdResp = await testApp.http
        .post('/api/v1/households')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          name: 'Remove Test Household',
          headPartyId,
        });

      const householdId = householdResp.body.id;

      // Add member
      await testApp.http
        .post(`/api/v1/households/${householdId}/members`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          partyId: memberPartyId,
          relation: 'SPOUSE',
        });

      // Remove member
      const response = await testApp.http
        .delete(`/api/v1/households/${householdId}/members/${memberPartyId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);
    });

    it('requires party.write permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .delete('/api/v1/households/household_1/members/party_1')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('AC-M03-12 Household rules', () => {
    it('enforces one SELF per household', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const householdResp = await testApp.http
        .post('/api/v1/households')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          name: 'SELF Test Household',
          headPartyId,
        });

      const householdId = householdResp.body.id;

      // Try to add another SELF
      const response = await testApp.http
        .post(`/api/v1/households/${householdId}/members`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          partyId: memberPartyId,
          relation: 'SELF',
        });

      expect(response.status).toBe(422); // BusinessRuleError
    });

    it('prevents head removal while members exist', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const householdResp = await testApp.http
        .post('/api/v1/households')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          name: 'Head Remove Test',
          headPartyId,
        });

      const householdId = householdResp.body.id;

      // Add a member
      await testApp.http
        .post(`/api/v1/households/${householdId}/members`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          partyId: memberPartyId,
          relation: 'SPOUSE',
        });

      // Try to remove head
      const response = await testApp.http
        .delete(`/api/v1/households/${householdId}/members/${headPartyId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(422); // BusinessRuleError
    });

    it('allows head removal when no other members', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create a new party for sole household
      const partyResp = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Sole Member',
          contacts: [{ channel: 'MOBILE', value: '+919999999999' }],
        });

      const solePartyId = partyResp.body.party.id;

      const householdResp = await testApp.http
        .post('/api/v1/households')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          name: 'Sole Household',
          headPartyId: solePartyId,
        });

      const householdId = householdResp.body.id;

      // Remove sole member (head)
      const response = await testApp.http
        .delete(`/api/v1/households/${householdId}/members/${solePartyId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);
    });
  });
});
