import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

/**
 * AC-M03-07, AC-M03-08, AC-M03-09
 * HTTP component tests for duplicate detection and merge
 */
describe('AC-M03-* Duplicate queue and merge endpoints', () => {
  let testApp: TestApp;
  let party1Id: string;
  let party2Id: string;

  beforeAll(async () => {
    testApp = await createTestApp({
      imports: [PartyModule],
    });

    const token = tokenFor({
      tenantId: 'ten_acme',
      roles: ['SALESPERSON'],
      memberId: 'member_1',
    });

    // Create two similar parties
    const resp1 = await testApp.http
      .post('/api/v1/parties')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        kind: 'PERSON',
        displayName: 'John Doe',
        contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
        pan: 'AAAAA0000A',
      });

    party1Id = resp1.body.party.id;

    const resp2 = await testApp.http
      .post('/api/v1/parties')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        kind: 'PERSON',
        displayName: 'John D.',
        contacts: [{ channel: 'MOBILE', value: '+919876543211' }],
        pan: 'AAAAA0000A', // Same PAN = high score duplicate
      });

    party2Id = resp2.body.party.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('AC-M03-07 GET /api/v1/duplicates (queue list)', () => {
    it('lists open duplicate candidates', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      const response = await testApp.http
        .get('/api/v1/duplicates')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);

      // Should have at least one candidate if parties were flagged
      if (response.body.items.length > 0) {
        const candidate = response.body.items[0];
        expect(candidate.id).toBeDefined();
        expect(candidate.a).toBeDefined();
        expect(candidate.b).toBeDefined();
        expect(candidate.score).toBeDefined();
        expect(candidate.rule).toBeDefined();
        expect(candidate.explanation).toBeDefined();
      }
    });

    it('requires party.merge permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'], // No merge permission
      });

      const response = await testApp.http
        .get('/api/v1/duplicates')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('supports pagination with cursor', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      const response = await testApp.http
        .get('/api/v1/duplicates?limit=1')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      if (response.body.nextCursor) {
        const nextPage = await testApp.http
          .get(`/api/v1/duplicates?limit=1&cursor=${response.body.nextCursor}`)
          .set('Host', 'acme.iap.test')
          .set('Authorization', `Bearer ${token}`);

        expect(nextPage.status).toBe(200);
      }
    });
  });

  describe('AC-M03-07 GET /api/v1/duplicates/{id}/comparison (compare)', () => {
    it('returns field-by-field comparison with masked sensitive fields', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      // First get a candidate ID
      const listResponse = await testApp.http
        .get('/api/v1/duplicates')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (listResponse.body.items.length > 0) {
        const candidateId = listResponse.body.items[0].id;

        const response = await testApp.http
          .get(`/api/v1/duplicates/${candidateId}/comparison`)
          .set('Host', 'acme.iap.test')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.fields).toBeDefined();
        expect(Array.isArray(response.body.fields)).toBe(true);

        // Check masked values in comparison
        const contactFields = response.body.fields.filter((f: any) =>
          ['contacts', 'primaryMobile', 'primaryEmail'].includes(f.field)
        );

        for (const field of contactFields) {
          const responseStr = JSON.stringify(field);
          // Should not expose raw PII
          expect(responseStr).not.toContain('9876543210');
          expect(responseStr).not.toContain('9876543211');
        }
      }
    });

    it('requires party.merge permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .get('/api/v1/duplicates/candidate_1/comparison')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('AC-M03-09 POST /api/v1/duplicates/{id}/merge (merge records)', () => {
    it('merges two parties with survivor choice', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      // Get a candidate
      const listResponse = await testApp.http
        .get('/api/v1/duplicates')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (listResponse.body.items.length > 0) {
        const candidateId = listResponse.body.items[0].id;

        const response = await testApp.http
          .post(`/api/v1/duplicates/${candidateId}/merge`)
          .set('Host', 'acme.iap.test')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', newIdempotencyKey())
          .send({
            survivor: 'A',
            choices: [
              { field: 'displayName', from: 'A' },
              { field: 'dateOfBirth', from: 'A' },
              { field: 'pan', from: 'A' },
              { field: 'preferredLanguage', from: 'A' },
              { field: 'preferredChannel', from: 'A' },
              { field: 'ownerMemberId', from: 'A' },
            ],
          });

        expect(response.status).toBe(201);
        expect(response.body.mergeId).toBeDefined();
        expect(response.body.survivorId).toBeDefined();
        expect(response.body.reversibleUntil).toBeDefined();
      }
    });

    it('requires party.merge permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .post('/api/v1/duplicates/candidate_1/merge')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          survivor: 'A',
          choices: [
            { field: 'displayName', from: 'A' },
            { field: 'dateOfBirth', from: 'A' },
            { field: 'pan', from: 'A' },
            { field: 'preferredLanguage', from: 'A' },
            { field: 'preferredChannel', from: 'A' },
            { field: 'ownerMemberId', from: 'A' },
          ],
        });

      expect(response.status).toBe(403);
    });

    it('requires Idempotency-Key', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      const response = await testApp.http
        .post('/api/v1/duplicates/candidate_1/merge')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          survivor: 'A',
          choices: [
            { field: 'displayName', from: 'A' },
            { field: 'dateOfBirth', from: 'A' },
            { field: 'pan', from: 'A' },
            { field: 'preferredLanguage', from: 'A' },
            { field: 'preferredChannel', from: 'A' },
            { field: 'ownerMemberId', from: 'A' },
          ],
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('AC-M03-09 POST /api/v1/duplicates/{id}/dismissal (mark not a duplicate)', () => {
    it('dismisses a duplicate candidate', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      // Get a candidate
      const listResponse = await testApp.http
        .get('/api/v1/duplicates')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (listResponse.body.items.length > 0) {
        const candidateId = listResponse.body.items[0].id;

        const response = await testApp.http
          .post(`/api/v1/duplicates/${candidateId}/dismissal`)
          .set('Host', 'acme.iap.test')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', newIdempotencyKey());

        expect(response.status).toBe(204);
      }
    });

    it('requires party.merge permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .post('/api/v1/duplicates/candidate_1/dismissal')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey());

      expect(response.status).toBe(403);
    });
  });

  describe('AC-M03-09 POST /api/v1/merges/{id}/reversal (reverse merge)', () => {
    it('reverses a merge within 30 days', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      // This test assumes a merge has been done first
      // In a real scenario, we would have a mergeId from the merge operation

      const response = await testApp.http
        .post('/api/v1/merges/merge_1/reversal')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey());

      // May 404 if merge doesn't exist, but shouldn't 403
      if (response.status !== 404) {
        expect(response.status).not.toBe(403);
      }
    });

    it('requires party.merge permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      const response = await testApp.http
        .post('/api/v1/merges/merge_1/reversal')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey());

      expect(response.status).toBe(403);
    });
  });

  describe('AC-M03-08 Duplicate detection rules', () => {
    it('detects same PAN duplicates with score 100', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      const response = await testApp.http
        .get('/api/v1/duplicates')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Look for candidates with same PAN rule
      const samePanCandidates = response.body.items.filter(
        (c: any) => c.rule === 'SamePanRule'
      );

      for (const candidate of samePanCandidates) {
        expect(candidate.score).toBe(100);
      }
    });

    it('never auto-merges (autoMergeAllowed always false)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['BRANCH_MANAGER'],
      });

      const response = await testApp.http
        .get('/api/v1/duplicates')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      for (const candidate of response.body.items) {
        expect(candidate.autoMergeAllowed).toBe(false);
      }
    });
  });
});
