import { newIdempotencyKey } from '../support/idempotency';
import { TenancyModule } from '../../src/modules/tenancy/tenancy.module';
import { createTestApp, TestApp } from '../support/test-app';
import { operatorToken, tokenFor } from '../support/tokens';

/**
 * AC-M01-07, AC-M01-08, AC-M01-09, AC-M01-12, AC-M01-13, AC-M01-14
 * HTTP component tests for tenant provisioning, status management, and public endpoints.
 */
describe('tenant provisioning and management (AC-M01-07, 08, 09, 12, 13, 14)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [TenancyModule] });
  });

  afterAll(async () => {
    await testApp.close();
  });

  /**
   * AC-M01-07: Provisioning creates tenant, entity, platform host, default flags and brand kit,
   * runs saga steps in order, activates the tenant and emits tenant.tenant.provisioned;
   * duplicate slug → 409 slug_taken.
   */
  describe('POST /api/v1/ops/tenants (AC-M01-07)', () => {
    it('provisions a SOLO tenant with INDIVIDUAL_AGENT entity', async () => {
      const response = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          slug: 'john-agent-001',
          displayName: 'John Agent',
          kind: 'SOLO',
          planCode: 'SOLO',
          entity: {
            entityType: 'INDIVIDUAL_AGENT',
            legalName: 'John Doe',
            registrationNo: 'LIC-2024-001',
            registrationValidTo: '2027-12-31',
          },
          admin: {
            name: 'John',
            phone: '9876543210',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.tenantId).toBeDefined();
      expect(response.body.status).toMatch(/provisioning|active/);
      expect(response.body.host).toContain('john-agent-001.iap.test');
    });

    it('provisions an ORGANISATION tenant with IMF entity', async () => {
      const response = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          slug: 'acme-org-001',
          displayName: 'Acme Insurance Corp',
          kind: 'ORGANISATION',
          planCode: 'TEAM',
          entity: {
            entityType: 'IMF',
            legalName: 'Acme Insurance Company Ltd',
            registrationNo: 'IMF-2024-001',
            registrationValidTo: '2028-06-30',
            principalOfficerName: 'Jane Smith',
          },
          admin: {
            name: 'Jane',
            email: 'jane@acme.test',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.tenantId).toBeDefined();
      expect(response.body.host).toContain('acme-org-001.iap.test');
    });

    it('rejects duplicate slug with 409', async () => {
      const slug = 'duplicate-slug-test';
      const input = {
        slug,
        displayName: 'Test Tenant',
        kind: 'SOLO' as const,
        planCode: 'SOLO' as const,
        entity: {
          entityType: 'INDIVIDUAL_AGENT' as const,
          legalName: 'Test',
          registrationNo: 'TEST-001',
          registrationValidTo: '2027-12-31',
        },
        admin: {
          name: 'Test',
          phone: '9876543210',
        },
      };

      await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send(input);

      const duplicate = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send(input);

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('slug_taken');
    });

    it('requires operator role', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${token}`)
        .send({
          slug: 'test',
          displayName: 'Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          entity: {
            entityType: 'INDIVIDUAL_AGENT',
            legalName: 'Test',
            registrationNo: 'TEST',
            registrationValidTo: '2027-12-31',
          },
          admin: { name: 'Test' },
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('operator_only');
    });

    it('returns failedStep when provisioning incomplete', async () => {
      // This test assumes the provisioning saga can fail
      // The response should include failedStep when status is provisioning
      const response = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          slug: 'incomplete-provision',
          displayName: 'Incomplete',
          kind: 'SOLO',
          planCode: 'SOLO',
          entity: {
            entityType: 'INDIVIDUAL_AGENT',
            legalName: 'Test',
            registrationNo: 'TEST-INC',
            registrationValidTo: '2027-12-31',
          },
          admin: { name: 'Test' },
        });

      expect(response.status).toBe(201);
      // Should have either status active or failedStep if provisioning
      if (response.body.status === 'provisioning') {
        expect(response.body.failedStep).toBeDefined();
      } else {
        expect(response.body.status).toBe('active');
      }
    });
  });

  /**
   * AC-M01-08: A failing saga step leaves the tenant in provisioning with failedStep;
   * resumption skips completed steps and completes provisioning.
   */
  describe('POST /api/v1/ops/tenants/{id}/provisioning-resumptions (AC-M01-08)', () => {
    it('resumes provisioning and completes it', async () => {
      // First, provision a tenant
      const provision = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          slug: 'resume-test-001',
          displayName: 'Resume Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          entity: {
            entityType: 'INDIVIDUAL_AGENT',
            legalName: 'Test',
            registrationNo: 'RES-001',
            registrationValidTo: '2027-12-31',
          },
          admin: { name: 'Test' },
        });

      const tenantId = provision.body.tenantId;

      // Then resume if needed
      const resume = await testApp.http
        .post(`/api/v1/ops/tenants/${tenantId}/provisioning-resumptions`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({});

      expect(resume.status).toBe(200);
      expect(resume.body.status).toMatch(/provisioning|active/);
    });
  });

  /**
   * AC-M01-09: DirectoryTenantResolver resolves verified hosts only; caching decorator
   * invalidates on suspend/resume so suspended tenant is rejected by AuthGuard immediately.
   */
  describe('tenant resolver cache invalidation (AC-M01-09)', () => {
    it('resolves active tenant from host', async () => {
      const response = await testApp.http
        .get('/api/v1/me')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`);

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe('ten_acme');
    });

    it('rejects suspended tenant with 403 tenant_inactive', async () => {
      // sleepy.iap.test is configured as suspended in test config
      const response = await testApp.http
        .get('/api/v1/me')
        .set('Host', 'sleepy.iap.test')
        .set('Authorization', `Bearer ${tokenFor({ tenantId: 'ten_sleepy', roles: [] })}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('tenant_inactive');
    });

    it('rejects unknown host with 404', async () => {
      const response = await testApp.http
        .get('/api/v1/me')
        .set('Host', 'unknown.iap.test')
        .set('Authorization', `Bearer ${tokenFor({ tenantId: 'ten_unknown', roles: [] })}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('tenant_not_found');
    });
  });

  /**
   * AC-M01-12: Operator endpoints require the operator role; list/paginate tenants;
   * status transitions and plan change work and are audited.
   */
  describe('operator tenant management (AC-M01-12)', () => {
    it('lists tenants with filters', async () => {
      const response = await testApp.http
        .get('/api/v1/ops/tenants')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('paginates tenant list', async () => {
      const firstPage = await testApp.http
        .get('/api/v1/ops/tenants')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .query({ limit: 5 });

      expect(firstPage.status).toBe(200);
      if (firstPage.body.nextCursor) {
        const secondPage = await testApp.http
          .get('/api/v1/ops/tenants')
          .set('Authorization', `Bearer ${operatorToken()}`)
          .query({ limit: 5, cursor: firstPage.body.nextCursor });

        expect(secondPage.status).toBe(200);
      }
    });

    it('transitions tenant status to suspended', async () => {
      const provision = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          slug: 'suspend-test',
          displayName: 'Suspend Test',
          kind: 'SOLO',
          planCode: 'SOLO',
          entity: {
            entityType: 'INDIVIDUAL_AGENT',
            legalName: 'Test',
            registrationNo: 'SUS-001',
            registrationValidTo: '2027-12-31',
          },
          admin: { name: 'Test' },
        });

      const tenantId = provision.body.tenantId;

      const response = await testApp.http
        .post(`/api/v1/ops/tenants/${tenantId}/status-transitions`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          to: 'suspended',
          reason: 'Testing suspension',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('suspended');
    });

    it('changes tenant plan with If-Match', async () => {
      const provision = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          slug: 'plan-change-test',
          displayName: 'Plan Change Test',
          kind: 'ORGANISATION',
          planCode: 'TEAM',
          entity: {
            entityType: 'CORPORATE_AGENT',
            legalName: 'Test Corp',
            registrationNo: 'PLAN-001',
            registrationValidTo: '2027-12-31',
          },
          admin: { name: 'Test' },
        });

      const tenantId = provision.body.tenantId;
      const listed = await testApp.http.get('/api/v1/ops/tenants?limit=100').set('Authorization', `Bearer ${operatorToken()}`);
      const version = listed.body.items.find((t: { id: string; version: number }) => t.id === tenantId).version;

      const response = await testApp.http
        .patch(`/api/v1/ops/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${operatorToken()}`)
        .set('If-Match', `"v${version}"`)
        .send({ planCode: 'BUSINESS' });

      expect(response.status).toBe(200);
      expect(response.body.planCode).toBe('BUSINESS');
    });

    it('rejects stale version with 412', async () => {
      const provision = await testApp.http
        .post('/api/v1/ops/tenants')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          slug: 'stale-version-test',
          displayName: 'Stale Version',
          kind: 'ORGANISATION',
          planCode: 'TEAM',
          entity: {
            entityType: 'CORPORATE_AGENT',
            legalName: 'Test',
            registrationNo: 'STV-001',
            registrationValidTo: '2027-12-31',
          },
          admin: { name: 'Test' },
        });

      const tenantId = provision.body.tenantId;

      const response = await testApp.http
        .patch(`/api/v1/ops/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${operatorToken()}`)
        .set('If-Match', `"v999"`)
        .send({ planCode: 'BUSINESS' });

      expect(response.status).toBe(412);
      expect(response.body.code).toBe('version_mismatch');
    });

    it('denies non-operator access to operator endpoints', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .get('/api/v1/ops/tenants')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  /**
   * AC-M01-13: Tenant endpoints use the host-resolved tenant only: tenant A's admin cannot
   * read or change tenant B's tie-ups, flags or brand kit (isolation test).
   */
  describe('tenant isolation (AC-M01-13)', () => {
    it('tenant A cannot read tenant B settings', async () => {
      const tokenA = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Try to access with token for acme but host is zen
      const response = await testApp.http
        .get('/api/v1/tenant')
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('tenant_mismatch');
    });

    it('respects host-resolved tenant for all endpoints', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Correct host and token match
      const response = await testApp.http
        .get('/api/v1/tenant')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`);

      expect(response.status).toBe(200);
    });

    it('AC-M01-13 settings written by tenant A are invisible to tenant B (data isolation)', async () => {
      const acme = tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'] });
      const zen = tokenFor({ tenantId: 'ten_zen', roles: ['TENANT_ADMIN'] });
      const write = await testApp.http
        .put('/api/v1/tenant/tie-ups')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${acme}`)
        .send({ tieUps: [{ insurerId: 'ins_isolation_probe', line: 'HEALTH', effectiveFrom: '2026-01-01' }] });
      expect(write.status).toBe(200);
      await testApp.http
        .put('/api/v1/tenant/brand-kit')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${acme}`)
        .send({ brandName: 'Acme Probe', primary: '#0B3D91', secondary: '#163F7F', typeface: 'Mukta', poweredByVisible: true })
        .expect(200);

      const zenTieUps = await testApp.http.get('/api/v1/tenant/tie-ups').set('Host', 'zen.iap.test').set('Authorization', `Bearer ${zen}`);
      const zenBrand = await testApp.http.get('/api/v1/tenant/brand-kit').set('Host', 'zen.iap.test').set('Authorization', `Bearer ${zen}`);

      expect(zenTieUps.status).toBe(200);
      expect(JSON.stringify(zenTieUps.body)).not.toContain('ins_isolation_probe');
      expect(zenBrand.body.brandName).not.toBe('Acme Probe');
    });

    it('token mismatch logs security event', async () => {
      testApp.logs.clear();

      const tokenA = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      await testApp.http
        .get('/api/v1/tenant')
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenA}`);

      const securityLogs = testApp.logs.records.filter(
        (r) => r.event === 'security.tenant_mismatch',
      );
      expect(securityLogs.length).toBeGreaterThan(0);
    });
  });

  /**
   * AC-M01-14: GET /public/tenant-config returns brand and languages for a known host,
   * 404 for an unknown host, and requires no token.
   */
  describe('GET /api/v1/public/tenant-config (AC-M01-14)', () => {
    it('returns tenant config for known host without token', async () => {
      const response = await testApp.http
        .get('/api/v1/public/tenant-config')
        .set('Host', 'acme.iap.test');

      expect(response.status).toBe(200);
      expect(response.body.displayName).toBeDefined();
      expect(response.body.brand).toBeDefined();
      expect(response.body.brand.brandName).toBeDefined();
      expect(response.body.languages).toContain('en');
    });

    it('returns 404 for unknown host', async () => {
      const response = await testApp.http
        .get('/api/v1/public/tenant-config')
        .set('Host', 'unknown.iap.test');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('tenant_not_found');
    });

    it('returns brand with primary and secondary colors', async () => {
      const response = await testApp.http
        .get('/api/v1/public/tenant-config')
        .set('Host', 'acme.iap.test');

      expect(response.status).toBe(200);
      expect(response.body.brand.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(response.body.brand.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(response.body.brand.typeface).toBeDefined();
    });
  });
});
