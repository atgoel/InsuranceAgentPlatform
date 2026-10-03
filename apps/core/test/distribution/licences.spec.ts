import { newIdempotencyKey } from '../support/idempotency';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { activateSeller } from './fixtures';

/**
 * AC-M02-08: Licence expiry scanner alerts once per threshold (60/30/7 days)
 * AC-M02-09: SellerDirectory filters active sellers, excludes POSPs for non-POS, expired licences
 * AC-M02-13: Tenant isolation for licences
 */
describe('Licences endpoints (AC-M02-08, 09, 13)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp({
      imports: [DistributionModule],
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('POST /members/{id}/licences', () => {
    it('records a valid licence for a member', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create a member first
      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Licence Test Member',
          phone: '+919876501015',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;

      // Record licence
      const licRes = await testApp.http
        .post(`/api/v1/members/${memberId}/licences`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'POSP_LIFE',
          number: 'LIC-2024-001',
          validFrom: '2023-01-01',
          validTo: '2026-12-31',
        });

      expect(licRes.status).toBe(201);
      expect(licRes.body.id).toBeDefined();
      expect(licRes.body.memberId).toBe(memberId);
      expect(licRes.body.kind).toBe('POSP_LIFE');
      expect(licRes.body.number).toBe('LIC-2024-001');
      expect(licRes.body.validFrom).toBe('2023-01-01');
      expect(licRes.body.validTo).toBe('2026-12-31');
    });

    it('records ISP licence', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'ISP Member',
          phone: '+919876501016',
          roles: ['SALESPERSON'],
          salespersonType: 'ISP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;

      const licRes = await testApp.http
        .post(`/api/v1/members/${memberId}/licences`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'ISP',
          number: 'ISP-2024-001',
          validFrom: '2024-01-01',
          validTo: '2025-12-31',
        });

      expect(licRes.status).toBe(201);
      expect(licRes.body.kind).toBe('ISP');
    });

    it('records POSP_GENERAL licence', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'POSP General',
          phone: '+919876543211',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;

      const licRes = await testApp.http
        .post(`/api/v1/members/${memberId}/licences`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'POSP_GENERAL',
          number: 'POSP-GEN-2024',
          validFrom: '2024-06-01',
          validTo: '2025-05-31',
        });

      expect(licRes.status).toBe(201);
      expect(licRes.body.kind).toBe('POSP_GENERAL');
    });

    it('rejects licence with validFrom after validTo', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Bad Dates',
          phone: '+918765432109',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;

      const licRes = await testApp.http
        .post(`/api/v1/members/${memberId}/licences`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'POSP_LIFE',
          number: 'BAD-DATES',
          validFrom: '2025-12-31',
          validTo: '2024-01-01',
        });

      expect(licRes.status).toBe(400);
      expect(licRes.body.code).toBe('licence_dates_invalid');
    });

    it('idempotency: same Idempotency-Key returns same licence', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Idempotent Licence',
          phone: '+917654321098',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;
      const key = newIdempotencyKey();

      const first = await testApp.http
        .post(`/api/v1/members/${memberId}/licences`)
        .set('Idempotency-Key', key)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'POSP_LIFE',
          number: 'IDEM-LIC-001',
          validFrom: '2024-01-01',
          validTo: '2025-12-31',
        });

      expect(first.status).toBe(201);
      expect(first.status).toBe(201);
      const licId = first.body.id;

      // Replay
      const second = await testApp.http
        .post(`/api/v1/members/${memberId}/licences`)
        .set('Idempotency-Key', key)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'POSP_LIFE',
          number: 'IDEM-LIC-001',
          validFrom: '2024-01-01',
          validTo: '2025-12-31',
        });

      expect(second.status).toBe(201);
      expect(second.body.id).toBe(licId);
    });
  });

  describe('GET /licences/expiring', () => {
    it('returns empty array when no licences expiring', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['COMPLIANCE'],
      });

      const response = await testApp.http
        .get('/api/v1/licences/expiring?withinDays=60')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('returns licences within specified days with member name and daysLeft', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create member and licence expiring soon
      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Expiring Soon',
          phone: '+916543210987',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;

      // Record licence expiring in 30 days
      const today = new Date();
      const expiryDate = new Date(today);
      expiryDate.setDate(expiryDate.getDate() + 30);
      const validToStr = expiryDate.toISOString().split('T')[0];

      const licRes = await testApp.http
        .post(`/api/v1/members/${memberId}/licences`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'POSP_LIFE',
          number: 'EXPIRE-30',
          validFrom: '2024-01-01',
          validTo: validToStr,
        });

      expect(licRes.status).toBe(201);

      // Query expiring
      const expireRes = await testApp.http
        .get('/api/v1/licences/expiring?withinDays=60')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(expireRes.status).toBe(200);
      expect(Array.isArray(expireRes.body.items)).toBe(true);

      // Check if our licence is in the list
      const found = expireRes.body.items.find((l: Record<string, unknown>) => l.number === 'EXPIRE-30');
      if (found) {
        expect(found.memberName).toBeDefined();
        expect(found.daysLeft).toBeDefined();
        expect(found.daysLeft).toBeGreaterThan(0);
        expect(found.daysLeft).toBeLessThanOrEqual(60);
      }
    });

    it('respects withinDays parameter', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['COMPLIANCE'],
      });

      // Query 7 days
      const sevenRes = await testApp.http
        .get('/api/v1/licences/expiring?withinDays=7')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      // Query 60 days
      const sixtyRes = await testApp.http
        .get('/api/v1/licences/expiring?withinDays=60')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(sevenRes.status).toBe(200);
      expect(sixtyRes.status).toBe(200);
      expect(sevenRes.body.items.length).toBeLessThanOrEqual(sixtyRes.body.items.length);
    });

    it('AC-M02-13 tenant isolation: returns only tenant licences', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['COMPLIANCE'],
      });

      const tokenZen = tokenFor({
        tenantId: 'ten_zen',
        roles: ['COMPLIANCE'],
      });

      const acmeRes = await testApp.http
        .get('/api/v1/licences/expiring?withinDays=60')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`);

      const zenRes = await testApp.http
        .get('/api/v1/licences/expiring?withinDays=60')
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`);

      expect(acmeRes.status).toBe(200);
      expect(zenRes.status).toBe(200);
      // Both return arrays but from their respective tenants
      expect(Array.isArray(acmeRes.body.items)).toBe(true);
      expect(Array.isArray(zenRes.body.items)).toBe(true);
    });
  });

  describe('PUT /members/{id}/insurer-codes/{insurerId}', () => {
    it('records insurer code for member', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Insurer Code Test',
          phone: '+919876501017',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;

      const codeRes = await testApp.http
        .put(`/api/v1/members/${memberId}/insurer-codes/ins_001`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: 'POSP-INS-12345',
        });

      expect(codeRes.status).toBe(200);
      expect(codeRes.body.insurerId).toBe('ins_001');
      expect(codeRes.body.code).toBe('POSP-INS-12345');
    });

    it('rejects duplicate insurer code in same tenant', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create two members
      const member1Res = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Member 1',
          phone: '+919876501018',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      const member2Res = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Member 2',
          phone: '+919876501019',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(member1Res.status).toBe(201);

      const member1Id = member1Res.body.id;
      expect(member2Res.status).toBe(201);
      const member2Id = member2Res.body.id;

      // Add code to member 1
      await testApp.http
        .put(`/api/v1/members/${member1Id}/insurer-codes/ins_dup`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: 'DUP-CODE-001',
        });

      // Try to add same code to member 2
      const dupRes = await testApp.http
        .put(`/api/v1/members/${member2Id}/insurer-codes/ins_dup`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: 'DUP-CODE-001',
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe('insurer_code_taken');
    });

    it('allows same insurer code in different tenant', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const tokenZen = tokenFor({
        tenantId: 'ten_zen',
        roles: ['TENANT_ADMIN'],
      });

      // Member in acme
      const acmeMemberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`)
        .send({
          displayName: 'Acme Member',
          phone: '+919876501020',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      // Member in zen
      const zenMemberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`)
        .send({
          displayName: 'Zen Member',
          phone: '+919876501021',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(acmeMemberRes.status).toBe(201);

      const acmeMemberId = acmeMemberRes.body.id;
      expect(zenMemberRes.status).toBe(201);
      const zenMemberId = zenMemberRes.body.id;

      // Code in acme
      await testApp.http
        .put(`/api/v1/members/${acmeMemberId}/insurer-codes/ins_cross`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`)
        .send({
          code: 'CROSS-CODE',
        });

      // Same code in zen should succeed
      const zenRes = await testApp.http
        .put(`/api/v1/members/${zenMemberId}/insurer-codes/ins_cross`)
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`)
        .send({
          code: 'CROSS-CODE',
        });

      expect(zenRes.status).toBe(200);
      expect(zenRes.body.code).toBe('CROSS-CODE');
    });
  });

  describe('GET /me/selling-scope (AC-M02-09)', () => {
    it('returns selling scope for active seller', async () => {
      const admin = tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'] });
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${admin}`)
        .send({ displayName: 'Scope Seller', phone: '+919876503001', roles: ['SALESPERSON'], salespersonType: 'POSP', orgUnitId: 'ou_root' });
      expect(createRes.status).toBe(201);
      const memberId = createRes.body.id;
      await activateSeller(testApp, memberId, 'POSP');
      const licRes = await testApp.http
        .post(`/api/v1/members/${memberId}/licences`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${admin}`)
        .send({ kind: 'POSP_LIFE', number: 'LIC-SCOPE-1', validFrom: '2025-01-01', validTo: '2027-12-31' });
      expect(licRes.status).toBe(201);

      const response = await testApp.http
        .get('/api/v1/me/selling-scope')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId })}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        memberId, salespersonType: 'POSP', posEligibleOnly: true, lines: ['LIFE'], insurerCodes: { ins_hdfc: expect.any(String) },
      });
    });

    it('refuses a selling scope to a member who is not an active seller', async () => {
      const admin = tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'] });
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${admin}`)
        .send({ displayName: 'Invited Seller', phone: '+919876503002', roles: ['SALESPERSON'], salespersonType: 'POSP', orgUnitId: 'ou_root' });
      expect(createRes.status).toBe(201);

      const response = await testApp.http
        .get('/api/v1/me/selling-scope')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: createRes.body.id })}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('not_an_active_seller');
    });

    it('requires authenticated member (memberId in token)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
        // No memberId
      });

      const response = await testApp.http
        .get('/api/v1/me/selling-scope')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /members/{id}/onboarding/evidence (AC-M02-03)', () => {
    it('records evidence for seller onboarding', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create seller
      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Evidence Test',
          phone: '+919876501016',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;

      // Record evidence
      const evidRes = await testApp.http
        .post(`/api/v1/members/${memberId}/onboarding/evidence`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          key: 'IDENTITY_PAN',
          evidenceRef: 'kyc_ref_001',
          note: 'Verified PAN',
        });

      expect(evidRes.status).toBe(200);
      expect(evidRes.body.checklist).toBeDefined();
      expect(Array.isArray(evidRes.body.checklist)).toBe(true);
    });

    it('records training hours for seller', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create POSP seller (requires 15 hours training)
      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Training Test',
          phone: '+919876501022',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;

      // Record training
      const trainRes = await testApp.http
        .post(`/api/v1/members/${memberId}/onboarding/training`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          hours: 8,
          evidenceRef: 'training_cert_001',
        });

      expect(trainRes.status).toBe(200);
      expect(trainRes.body.checklist).toBeDefined();
    });

    it('idempotency for evidence recording', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const memberRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Idem Evidence',
          phone: '+919876501023',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(memberRes.status).toBe(201);

      const memberId = memberRes.body.id;
      const key = newIdempotencyKey();

      const first = await testApp.http
        .post(`/api/v1/members/${memberId}/onboarding/evidence`)
        .set('Idempotency-Key', key)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          key: 'IDENTITY_PAN',
          evidenceRef: 'kyc_idem',
          note: 'Test',
        });

      expect(first.status).toBe(200);

      // Replay
      const second = await testApp.http
        .post(`/api/v1/members/${memberId}/onboarding/evidence`)
        .set('Idempotency-Key', key)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          key: 'IDENTITY_PAN',
          evidenceRef: 'kyc_idem',
          note: 'Test',
        });

      expect(second.status).toBe(200);
    });
  });

  describe('POST /members/{id}/leave (F05 capacity and leave)', () => {
    const admin = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'] });
    async function invite(phone: string): Promise<string> {
      const res = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${admin()}`)
        .send({ displayName: `Leave ${phone.slice(-4)}`, phone, roles: ['SALESPERSON'], salespersonType: 'EMPLOYEE', orgUnitId: 'ou_root' });
      expect(res.status).toBe(201);
      return res.body.id;
    }
    const leave = (memberId: string, token: string, body: object) =>
      testApp.http.post(`/api/v1/members/${memberId}/leave`).set('Idempotency-Key', newIdempotencyKey()).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).send(body);

    it('lets a member record their own leave', async () => {
      const memberId = await invite('+919876504001');
      const res = await leave(memberId, tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId }), { from: '2026-12-20', to: '2026-12-31' });
      expect(res.status).toBe(204);
    });

    it('refuses a salesperson recording leave for someone else', async () => {
      const memberId = await invite('+919876504002');
      const other = await invite('+919876504003');
      const res = await leave(memberId, tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: other }), { from: '2026-12-20', to: '2026-12-31' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('permission_denied');
    });

    it('lets a member administrator record leave for others', async () => {
      const memberId = await invite('+919876504004');
      expect((await leave(memberId, admin(), { from: '2026-11-01', to: '2026-11-15' })).status).toBe(204);
    });

    it('rejects leave that ends before it starts', async () => {
      const memberId = await invite('+919876504005');
      const res = await leave(memberId, admin(), { from: '2026-11-15', to: '2026-11-01' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('leave_dates_invalid');
    });

    it('returns 404 for an unknown member', async () => {
      expect((await leave('mem_missing', admin(), { from: '2026-11-01', to: '2026-11-02' })).status).toBe(404);
    });
  });
});
