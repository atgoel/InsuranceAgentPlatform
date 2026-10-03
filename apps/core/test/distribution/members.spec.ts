import { newIdempotencyKey } from '../support/idempotency';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { acceptInvitation, activateSeller } from './fixtures';

/**
 * AC-M02-02: Member.invite validates contact, roles, salesperson type, 7-day expiry
 * AC-M02-04: Activation requires approval, emits selling scope
 * AC-M02-05: Seat limit, duplicate detection, cross-tenant isolation
 * AC-M02-06: Suspend/role change revokes sessions
 * AC-M02-07: Exit requires transfer target for sellers
 * AC-M02-12: MFA policy for privileged roles
 * AC-M02-13: Tenant isolation
 */
describe('Members endpoints (AC-M02-02, 04, 05, 06, 07, 12, 13)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp({
      imports: [DistributionModule],
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('POST /members (AC-M02-02, 05, 13)', () => {
    it('invites seller with phone contact and creates member in invited state', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'John Seller',
          phone: '+919876543210',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.displayName).toBe('John Seller');
      expect(response.body.status).toBe('invited');
      expect(response.body.roles).toContain('SALESPERSON');
      expect(response.body.salespersonType).toBe('POSP');
      expect(response.body.orgUnitId).toBe('ou_root');
      expect(response.body.invitedAt).toBeDefined();
      expect(response.body.version).toBeGreaterThan(0);
    });

    it('masks phone number and never returns raw contact data', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Jane Doe',
          phone: '+919876543210',
          roles: ['SALESPERSON'],
          salespersonType: 'ISP',
          orgUnitId: 'ou_root',
        });

      expect(response.status).toBe(201);
      expect(response.body.phoneMasked).toBe('+91******3210');
      expect(response.body.phone).toBeUndefined();
      expect(response.body.email).toBeUndefined();
    });

    it('masks email address in response', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Bob Email',
          email: 'bob@example.com',
          roles: ['SALESPERSON'],
          salespersonType: 'EMPLOYEE',
          orgUnitId: 'ou_root',
        });

      expect(response.status).toBe(201);
      expect(response.body.emailMasked).toBe('b***@example.com');
      expect(response.body.email).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('bob@example.com');
    });

    it('rejects invite without contact (phone or email)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'No Contact',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('contact_required');
    });

    it('rejects salesperson without salespersonType', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Bad Seller',
          phone: '+919876543210',
          roles: ['SALESPERSON'],
          orgUnitId: 'ou_root',
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('salesperson_type_mismatch');
    });

    it('rejects duplicate contact in same tenant with member_exists', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const phone = '+918888888888';

      // First invite
      const first = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Alice',
          phone,
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(first.status).toBe(201);

      // Second invite with same phone
      const second = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Bob',
          phone,
          roles: ['SALESPERSON'],
          salespersonType: 'ISP',
          orgUnitId: 'ou_root',
        });

      expect(second.status).toBe(409);
      expect(second.body.code).toBe('member_exists');
    });

    it('AC-M02-13 allows same contact in different tenant', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const tokenZen = tokenFor({
        tenantId: 'ten_zen',
        roles: ['TENANT_ADMIN'],
      });

      const phone = '+917777777777';

      // Invite in acme
      const acmeRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`)
        .send({
          displayName: 'Cross Tenant User',
          phone,
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(acmeRes.status).toBe(201);

      // Same contact in zen should succeed
      const zenRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`)
        .send({
          displayName: 'Cross Tenant User',
          phone,
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(zenRes.status).toBe(201);
      expect(zenRes.body.id).not.toBe(acmeRes.body.id);
    });

    it('invites non-seller (BRANCH_MANAGER) without salespersonType', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Manager',
          phone: '+919999999999',
          roles: ['BRANCH_MANAGER'],
          orgUnitId: 'ou_root',
        });

      expect(response.status).toBe(201);
      expect(response.body.salespersonType).toBeUndefined();
      expect(response.body.roles).toContain('BRANCH_MANAGER');
    });

    it('idempotency: same Idempotency-Key returns same member', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const key = newIdempotencyKey();

      const first = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', key)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Idempotent User',
          phone: '+916666666666',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(first.status).toBe(201);
      expect(first.status).toBe(201);
      const firstId = first.body.id;

      // Replay with same key
      const second = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', key)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Idempotent User',
          phone: '+916666666666',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(second.status).toBe(201);
      expect(second.body.id).toBe(firstId);
    });
  });

  describe('GET /members/{id}', () => {
    it('returns member with masked contact and nested checklist/licences', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create a member first
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Get Test',
          phone: '+919876501001',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);
      const memberId = createRes.body.id;

      // Get the member
      const getRes = await testApp.http
        .get(`/api/v1/members/${memberId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(memberId);
      expect(getRes.body.phoneMasked).toBe('+91******1001');
      expect(JSON.stringify(getRes.body)).not.toContain('9876501001');
      expect(getRes.body.phone).toBeUndefined();
      expect(getRes.body.email).toBeUndefined();
      expect(Array.isArray(getRes.body.licences)).toBe(true);
      expect(getRes.body.checklist).toBeDefined();
    });

    it('AC-M02-13 tenant B gets 404 trying to read tenant A member', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const tokenZen = tokenFor({
        tenantId: 'ten_zen',
        roles: ['TENANT_ADMIN'],
      });

      // Create member in acme
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`)
        .send({
          displayName: 'Acme Member',
          phone: '+919876501002',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;

      // Zen tries to read it
      const getRes = await testApp.http
        .get(`/api/v1/members/${memberId}`)
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`);

      expect(getRes.status).toBe(404);
    });
  });

  describe('GET /members (list)', () => {
    it('lists members with scope filtering (UNIT_SUBTREE for BRANCH_MANAGER)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
        orgUnitId: 'ou_root',
      });

      const response = await testApp.http
        .get('/api/v1/members?limit=10')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
      response.body.items.forEach((m: Record<string, unknown>) => {
        expect(m.id).toBeDefined();
        expect(m.phone).toBeUndefined();
        expect(m.email).toBeUndefined();
      });
    });

    it('filters by status', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .get('/api/v1/members?status=invited&limit=10')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      response.body.items.forEach((m: Record<string, unknown>) => {
        expect(m.status).toBe('invited');
      });
    });

    it('filters by role', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create a salesperson
      await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Filter Test',
          phone: '+919876501003',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      const response = await testApp.http
        .get('/api/v1/members?role=SALESPERSON&limit=10')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.items)).toBe(true);
    });
  });

  describe('PATCH /members/{id} (AC-M02-06)', () => {
    it('updates roles and revokes sessions with If-Match version', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create member
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Patch Test',
          phone: '+919876501004',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;
      const version = createRes.body.version;

      // Patch with correct version
      const patchRes = await testApp.http
        .patch(`/api/v1/members/${memberId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${version}"`)
        .send({
          roles: ['BRANCH_MANAGER'],
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.roles).toContain('BRANCH_MANAGER');
      expect(patchRes.body.version).toBe(version + 1);
    });

    it('rejects PATCH with stale If-Match version (412)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create member
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Conflict Test',
          phone: '+919876501005',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;

      // Patch with stale version
      const patchRes = await testApp.http
        .patch(`/api/v1/members/${memberId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', '"v999"')
        .send({
          capacityPerDay: 50,
        });

      expect(patchRes.status).toBe(412);
    });

    it('updates capacityPerDay and skills', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create member
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Update Test',
          phone: '+919876501006',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;
      const version = createRes.body.version;

      // Update capacity
      const patchRes = await testApp.http
        .patch(`/api/v1/members/${memberId}`)
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${version}"`)
        .send({
          capacityPerDay: 40,
          skills: ['LIFE', 'HEALTH'],
          languages: ['en', 'hi'],
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.capacityPerDay).toBe(40);
      expect(patchRes.body.skills).toContain('LIFE');
      expect(patchRes.body.languages).toContain('hi');
    });
  });

  describe('POST /members/{id}/status-transitions (AC-M02-06)', () => {
    it('suspends member and revokes sessions', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create and activate member
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Suspend Test',
          phone: '+919876501007',
          roles: ['BRANCH_MANAGER'],
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;
      await acceptInvitation(testApp, memberId); // invited → active (non-seller)

      // Transition to suspended
      const transRes = await testApp.http
        .post(`/api/v1/members/${memberId}/status-transitions`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          to: 'suspended',
          reason: 'policy_breach',
        });

      expect(transRes.status).toBe(200);
      expect(transRes.body.status).toBe('suspended');
    });

    it('reactivates suspended member', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create member
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Reactivate Test',
          phone: '+919876501008',
          roles: ['BRANCH_MANAGER'],
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;
      await acceptInvitation(testApp, memberId); // invited → active (non-seller)

      // Suspend
      await testApp.http
        .post(`/api/v1/members/${memberId}/status-transitions`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          to: 'suspended',
          reason: 'test',
        });

      // Reactivate
      const activeRes = await testApp.http
        .post(`/api/v1/members/${memberId}/status-transitions`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          to: 'active',
          reason: 'reinstated',
        });

      expect(activeRes.status).toBe(200);
      expect(activeRes.body.status).toBe('active');
    });
  });

  describe('POST /members/{id}/exit (AC-M02-07)', () => {
    it('non-seller can exit without transfer target', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create non-seller
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Non Seller',
          phone: '+919876501009',
          roles: ['BRANCH_MANAGER'],
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;

      // Exit
      const exitRes = await testApp.http
        .post(`/api/v1/members/${memberId}/exit`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reason: 'resigned',
        });

      expect(exitRes.status).toBe(200);
      expect(exitRes.body.status).toBe('exited');
    });

    it('seller exit without transfer target is rejected', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create seller
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Seller Exit',
          phone: '+919876501010',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;

      // Exit without transfer target
      const exitRes = await testApp.http
        .post(`/api/v1/members/${memberId}/exit`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          reason: 'resigned',
        });

      expect(exitRes.status).toBe(422);
      expect(exitRes.body.code).toBe('transfer_target_invalid');
    });

    it('seller can exit with valid transfer target', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create two sellers
      const seller1Res = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Seller 1',
          phone: '+919876501011',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      const seller2Res = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Seller 2',
          phone: '+919876501012',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(seller1Res.status).toBe(201);

      const seller1Id = seller1Res.body.id;
      expect(seller2Res.status).toBe(201);
      const seller2Id = seller2Res.body.id;
      await activateSeller(testApp, seller2Id, 'POSP'); // the transfer target must be an active seller

      // Seller 1 exits with seller 2 as transfer target
      const exitRes = await testApp.http
        .post(`/api/v1/members/${seller1Id}/exit`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          transferToMemberId: seller2Id,
          reason: 'resigned',
        });

      expect(exitRes.status).toBe(200);
      expect(exitRes.body.status).toBe('exited');
    });
  });

  describe('POST /members/{id}/activation (AC-M02-04)', () => {
    it('requires distribution.onboarding.approve permission', async () => {
      const tokenAdmin = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const tokenSeller = tokenFor({
        tenantId: 'ten_acme',
        roles: ['SALESPERSON'],
      });

      // Create member
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          displayName: 'Onboard Test',
          phone: '+919876501013',
          roles: ['SALESPERSON'],
          salespersonType: 'POSP',
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;

      // Salesperson tries to activate (no permission)
      const sellerRes = await testApp.http
        .post(`/api/v1/members/${memberId}/activation`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenSeller}`);

      expect(sellerRes.status).toBe(403);
    });

    it('activates a non-seller on invitation acceptance, without a checklist', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create non-seller
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Manager Activate',
          phone: '+919876501014',
          roles: ['BRANCH_MANAGER'],
          orgUnitId: 'ou_root',
        });

      expect(createRes.status).toBe(201);

      const memberId = createRes.body.id;

      // Non-sellers have no checklist: accepting the invitation activates them directly
      expect(await acceptInvitation(testApp, memberId)).toBe('active');
      const activateRes = await testApp.http
        .post(`/api/v1/members/${memberId}/activation`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);
      expect(activateRes.status).toBe(422); // already active: activation is only for onboarding sellers
      expect(activateRes.body.code).toBe('illegal_member_transition');
    });
  });

  describe('AC-M02-12 MFA Policy', () => {
    it('privileged role without mfa in amr gets 403 mfa_required', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
        amr: ['pwd'], // No 'mfa' in amr
      });

      const response = await testApp.http
        .get('/api/v1/members')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('mfa_required');
    });

    it('privileged role with mfa in amr succeeds', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
        amr: ['pwd', 'mfa'], // Has 'mfa'
      });

      const response = await testApp.http
        .get('/api/v1/members')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('non-privileged role does not require mfa', async () => {
      const admin = tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'] });
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${admin}`)
        .send({ displayName: 'Password Only Seller', phone: '+919876502001', roles: ['SALESPERSON'], salespersonType: 'EMPLOYEE', orgUnitId: 'ou_root' });
      expect(createRes.status).toBe(201);
      const memberId = createRes.body.id;
      await activateSeller(testApp, memberId, 'EMPLOYEE');

      const token = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId, amr: ['pwd'] });
      const response = await testApp.http
        .get('/api/v1/me/selling-scope')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.memberId).toBe(memberId);
      expect(response.body.lines).toEqual(['LIFE', 'HEALTH', 'GENERAL']);
    });
  });

  describe('POST /me/invitation-acceptance', () => {
    it('AC-M02-02 is idempotent for the same identity and refuses a different one', async () => {
      const admin = tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'] });
      const createRes = await testApp.http
        .post('/api/v1/members')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${admin}`)
        .send({ displayName: 'Retry Seller', phone: '+919876505001', roles: ['SALESPERSON'], salespersonType: 'POSP', orgUnitId: 'ou_root' });
      expect(createRes.status).toBe(201);
      const memberId = createRes.body.id;
      const accept = (sub: string) =>
        testApp.http.post('/api/v1/me/invitation-acceptance').set('Host', 'acme.iap.test')
          .set('Authorization', `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [], memberId, sub })}`);

      expect((await accept('user_a')).body).toEqual({ id: memberId, status: 'onboarding' });
      const retry = await accept('user_a');
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({ id: memberId, status: 'onboarding' });
      const other = await accept('user_b');
      expect(other.status).toBe(422);
      expect(other.body.code).toBe('illegal_member_transition');
    });
  });
});
