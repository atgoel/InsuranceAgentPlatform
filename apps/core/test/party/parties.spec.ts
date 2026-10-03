import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { AUDIT_LOG, OUTBOX } from '../../src/kernel/tokens';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { newIdempotencyKey } from '../support/idempotency';

/**
 * AC-M03-01, AC-M03-08, AC-M03-10, AC-M03-11, AC-M03-13
 * HTTP component tests for parties endpoints
 */
describe('AC-M03-* Party endpoints', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp({
      imports: [PartyModule],
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('AC-M03-01 POST /api/v1/parties (create party)', () => {
    it('creates a party with minimal input', async () => {
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
          displayName: 'John Doe',
          contacts: [
            {
              channel: 'MOBILE',
              value: '+919876543210',
              isPrimary: true,
            },
          ],
          preferredLanguage: 'en',
        });

      expect(response.status).toBe(201);
      expect(response.body.party).toBeDefined();
      expect(response.body.party.id).toBeDefined();
      expect(response.body.party.displayName).toBe('John Doe');
      expect(response.body.party.kind).toBe('PERSON');
    });

    it('returns masked contact points, never raw values', async () => {
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
          displayName: 'Jane Smith',
          contacts: [
            {
              channel: 'MOBILE',
              value: '+919876543210',
            },
            {
              channel: 'EMAIL',
              value: 'jane@example.com',
            },
          ],
          preferredLanguage: 'en',
        });

      expect(response.status).toBe(201);
      const contacts = response.body.party.contacts;
      expect(contacts).toHaveLength(2);

      // Check no raw phone numbers anywhere in response
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toContain('9876543210');
      expect(responseStr).not.toContain('919876543210');
      expect(responseStr).not.toContain('+919876543210');
      expect(responseStr).not.toContain('jane@example.com');

      // But masked values should be present
      const mobile = contacts.find((c: { [k: string]: unknown }) => c.channel === 'MOBILE');
      expect(mobile.masked).toBeDefined();
      expect(mobile.masked).toMatch(/\+91-X{6}\d{4}/);
    });

    it('requires Idempotency-Key for POST', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const response = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'PERSON',
          displayName: 'John Doe',
          contacts: [
            {
              channel: 'MOBILE',
              value: '+919876543210',
            },
          ],
        });

      // Should require Idempotency-Key
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('returns 409 possible_duplicate when onDuplicate:reject and candidate score ≥90', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create first party
      const first = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'John Doe',
          contacts: [
            {
              channel: 'MOBILE',
              value: '+919876543210',
            },
          ],
          pan: 'AAAAA0000A',
        });

      expect(first.status).toBe(201);

      // Try to create identical party with onDuplicate: reject
      const duplicate = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'John Doe',
          contacts: [
            {
              channel: 'MOBILE',
              value: '+919876543210',
            },
          ],
          pan: 'AAAAA0000A',
          onDuplicate: 'reject',
        });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('possible_duplicate');
      expect(duplicate.body.candidates).toBeDefined();
      expect(duplicate.body.candidates.length).toBeGreaterThan(0);
      expect(duplicate.body.candidates[0].score).toBeGreaterThanOrEqual(90);
    });

    it('queues a candidate for same mobile + similar name, but not for a family member sharing the number (AC-M03-07)', async () => {
      const token = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_1' });
      const create = (displayName: string) =>
        testApp.http
          .post('/api/v1/parties')
          .set('Host', 'acme.iap.test')
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', newIdempotencyKey())
          .send({ kind: 'PERSON', displayName, contacts: [{ channel: 'MOBILE', value: '+919876543210' }], onDuplicate: 'create' });

      const first = await create('Ramesh Kumar');
      expect(first.status).toBe(201);

      const family = await create('Sunita Devi'); // shared family phone, different person
      expect(family.status).toBe(201);
      expect(family.body.duplicateCandidates).toEqual([]);

      const similar = await create('Ramesh Kumaar');
      expect(similar.status).toBe(201);
      expect(similar.body.duplicateCandidates).toHaveLength(1);
      expect(similar.body.duplicateCandidates[0]).toMatchObject({ score: 90, partyAId: expect.any(String), partyBId: expect.any(String) });
      expect([similar.body.duplicateCandidates[0].partyAId, similar.body.duplicateCandidates[0].partyBId]).toContain(first.body.party.id);
    });

    it('requires party.write permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['COMPLIANCE'], // No write permission
      });

      const response = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'John Doe',
          contacts: [
            {
              channel: 'MOBILE',
              value: '+919876543210',
            },
          ],
        });

      expect(response.status).toBe(403);
    });

    it('rejects invalid displayName (too short)', async () => {
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
          displayName: 'A',
          contacts: [
            {
              channel: 'MOBILE',
              value: '+919876543210',
            },
          ],
        });

      expect(response.status).toBe(400);
    });

    it('records audit trail for party creation', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const created = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Audit Test Party',
          contacts: [
            {
              channel: 'MOBILE',
              value: '+919876543210',
            },
          ],
        });

      expect(created.status).toBe(201);
      const partyId = created.body.party.id;
      const audit = testApp.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((e) => e.action === 'party.party.created' && e.entityId === partyId);
      const events = testApp.app.get<InMemoryOutbox>(OUTBOX).events.filter((e) => e.type === 'party.party.created' && e.subject === partyId);
      expect(audit).toHaveLength(1);
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ id: partyId, kind: 'PERSON', source: 'MANUAL' });

      // Neither the audit trail, the event nor the logs carry personal values (AC-M03-11)
      const auditStr = JSON.stringify([audit, events, testApp.logs.records]);
      expect(auditStr).not.toContain('9876543210');
      expect(auditStr).not.toContain('+919876543210');
      expect(auditStr).not.toContain('Audit Test Party');
    });
  });

  describe('AC-M03-10 GET /api/v1/parties (search)', () => {
    it('searches by name prefix', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create a party
      await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Alexander Johnson',
          contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
        });

      // Search by prefix
      const response = await testApp.http
        .get('/api/v1/parties?q=Alex')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
    });

    it('searches by 10-digit mobile number', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const response = await testApp.http
        .get('/api/v1/parties?q=9876543210')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
    });

    it('searches by email', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const response = await testApp.http
        .get('/api/v1/parties?q=test@example.com')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
    });

    it('applies record scope (salesperson sees only own parties)', async () => {
      const ownerToken = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_owner',
      });

      // Create a party
      await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Owner Party',
          contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
        });

      // Different salesperson token
      const otherToken = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_other',
      });

      // Should not see the other member's parties
      const response = await testApp.http
        .get('/api/v1/parties?q=Owner')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([]);

      // ...while the owner finds it
      const own = await testApp.http
        .get('/api/v1/parties?q=Owner')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(own.body.items.map((p: { displayName: string }) => p.displayName)).toEqual(['Owner Party']);
    });

    it('requires party.read permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .get('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('AC-M03-11 GET /api/v1/parties/{id} (get party)', () => {
    it('returns party with masked contacts and no raw PII', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const create = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'John Doe',
          contacts: [
            { channel: 'MOBILE', value: '+919876543210' },
            { channel: 'EMAIL', value: 'john@example.com' },
          ],
          dateOfBirth: '1990-05-15',
        });

      const partyId = create.body.party.id;

      const response = await testApp.http
        .get(`/api/v1/parties/${partyId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Check no raw PII in response
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toContain('9876543210');
      expect(responseStr).not.toContain('919876543210');
      expect(responseStr).not.toContain('+919876543210');
      expect(responseStr).not.toContain('john@example.com');
      expect(responseStr).not.toContain('1990-05-15');

      // But masked and year should be present
      expect(response.body.contacts[0].masked).toBeDefined();
      expect(response.body.dobYear).toBe(1990);
    });

    it('returns 404 for out-of-scope party', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Non-existent party ID
      const response = await testApp.http
        .get('/api/v1/parties/party_nonexistent')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    it('requires party.read permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .get('/api/v1/parties/party_1')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('AC-M03-13 Tenant isolation', () => {
    it('data in one tenant is invisible to another tenant', async () => {
      const acmeToken = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create party in acme tenant
      const acmeCreate = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${acmeToken}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Acme Party',
          contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
        });

      const acmePartyId = acmeCreate.body.party.id;

      // Try to access with zen tenant token
      const zenToken = tokenFor({
        tenantId: 'ten_zen',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const response = await testApp.http
        .get(`/api/v1/parties/${acmePartyId}`)
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${zenToken}`);

      // Should not be able to access acme's party
      expect(response.status).toBe(404);
    });

    it('identical person in different tenants is never matched', async () => {
      const acmeToken = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create party in acme with PAN
      await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${acmeToken}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'John Doe',
          contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
          pan: 'AAAAA0000A',
          onDuplicate: 'create',
        });

      const zenToken = tokenFor({
        tenantId: 'ten_zen',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create identical party in zen
      const zenCreate = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${zenToken}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'John Doe',
          contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
          pan: 'AAAAA0000A',
          onDuplicate: 'reject',
        });

      // Should be created successfully (no duplicate found across tenants)
      expect(zenCreate.status).toBe(201);
      // No duplicate candidates from acme tenant
      expect(zenCreate.body.duplicateCandidates).toEqual([]);
    });
  });

  describe('AC-M03-08 onDuplicate strategies', () => {
    it('onDuplicate:create queues candidates and creates party', async () => {
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
          displayName: 'Test Party',
          contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
          onDuplicate: 'create',
        });

      expect(response.status).toBe(201);
      expect(response.body.party.id).toBeDefined();
    });

    it('onDuplicate:reject refuses to create when candidate score ≥90', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      // Create initial party with PAN
      await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Existing Party',
          contacts: [{ channel: 'MOBILE', value: '+919811111111' }],
          pan: 'BBBBB0000B',
        });
      // (fixture above must succeed for the reject case to be meaningful)

      const response = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Existing Party',
          contacts: [{ channel: 'MOBILE', value: '+919811111111' }],
          pan: 'BBBBB0000B',
          onDuplicate: 'reject',
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('possible_duplicate');
    });
  });

  describe('AC-M03-01 PATCH /api/v1/parties/{id} (update party)', () => {
    it('updates displayName with If-Match version check', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const create = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Original Name',
          contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
        });

      const partyId = create.body.party.id;
      const version = create.body.party.version;

      const response = await testApp.http
        .patch(`/api/v1/parties/${partyId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${version}"`)
        .send({
          displayName: 'Updated Name',
        });

      expect(response.status).toBe(200);
      expect(response.body.displayName).toBe('Updated Name');
    });

    it('rejects update with mismatched If-Match version', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
        memberId: 'member_1',
      });

      const create = await testApp.http
        .post('/api/v1/parties')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', newIdempotencyKey())
        .send({
          kind: 'PERSON',
          displayName: 'Original Name',
          contacts: [{ channel: 'MOBILE', value: '+919876543210' }],
        });

      const partyId = create.body.party.id;

      const response = await testApp.http
        .patch(`/api/v1/parties/${partyId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', '"999"')
        .send({
          displayName: 'Updated Name',
        });

      expect(response.status).toBe(412);
    });

    it('requires party.write permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: [], // No permissions
      });

      const response = await testApp.http
        .patch('/api/v1/parties/party_1')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', '"1"')
        .send({
          displayName: 'Updated Name',
        });

      expect(response.status).toBe(403);
    });
  });
});
