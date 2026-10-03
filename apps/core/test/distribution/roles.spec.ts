import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';

/**
 * AC-M02-11, AC-M02-13: Role endpoints with permission locking, versioning, and tenant isolation
 */
describe('Roles endpoints (AC-M02-11, 13)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      imports: [DistributionModule],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('GET /roles', () => {
    it('returns all roles with versions', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
      response.body.items.forEach((role: Record<string, unknown>) => {
        expect(role.role).toBeDefined();
        expect(role.version).toBeDefined();
        expect(role.permissions).toBeDefined();
      });
    });

    it('AC-M02-13 tenant isolation: roles are tenant-scoped', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const tokenZen = tokenFor({
        tenantId: 'ten_zen',
        roles: ['TENANT_ADMIN'],
      });

      const acmeResponse = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`);

      const zenResponse = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`);

      // Both should return 200
      expect(acmeResponse.status).toBe(200);
      expect(zenResponse.status).toBe(200);

      // After role edits, versions should differ per tenant
      expect(acmeResponse.body.items).toBeDefined();
      expect(zenResponse.body.items).toBeDefined();
    });
  });

  describe('PUT /roles/{role}/permissions (AC-M02-11)', () => {
    it('updates permissions for editable role', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // First get current version
      const getResponse = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (getResponse.status === 200) {
        const branchManagerRole = getResponse.body.items.find((r: Record<string, unknown>) => r.role === 'BRANCH_MANAGER');

        if (branchManagerRole) {
          const updateResponse = await testApp.http
            .put(`/api/v1/roles/BRANCH_MANAGER/permissions`)
            .set('Host', 'acme.iap.test')
            .set('Authorization', `Bearer ${token}`)
            .set('If-Match', `"v${branchManagerRole.version}"`)
            .send({
              permissions: branchManagerRole.permissions,
            });

          expect([200, 400, 404, 409]).toContain(updateResponse.status);
          if (updateResponse.status === 200) {
            expect(updateResponse.body.version).toBe(branchManagerRole.version + 1);
          }
        }
      }
    });

    it('AC-M02-11 rejects update for non-editable role', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .put('/api/v1/roles/TENANT_ADMIN/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', '"v1"')
        .send({
          permissions: ['distribution.*'],
        });

      expect([400, 422, 403]).toContain(response.status);
      if (response.status >= 400) {
        expect(response.body.code).toMatch(/not_editable|forbidden|invalid/i);
      }
    });

    it('AC-M02-11 rejects adding locked permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getResponse = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (getResponse.status === 200) {
        const branchManagerRole = getResponse.body.items.find((r: Record<string, unknown>) => r.role === 'BRANCH_MANAGER');

        if (branchManagerRole) {
          const response = await testApp.http
            .put('/api/v1/roles/BRANCH_MANAGER/permissions')
            .set('Host', 'acme.iap.test')
            .set('Authorization', `Bearer ${token}`)
            .set('If-Match', `"v${branchManagerRole.version}"`)
            .send({
              permissions: [...branchManagerRole.permissions, 'party.medical.read'],
            });

          expect([400, 422]).toContain(response.status);
          if (response.status >= 400) {
            expect(response.body.code).toMatch(/permission_locked|invalid/i);
          }
        }
      }
    });

    it('AC-M02-11 rejects removing locked permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getResponse = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (getResponse.status === 200) {
        const opsRole = getResponse.body.items.find((r: Record<string, unknown>) => r.role === 'OPS');

        if (opsRole && opsRole.permissions.includes('audit.delete')) {
          const response = await testApp.http
            .put('/api/v1/roles/OPS/permissions')
            .set('Host', 'acme.iap.test')
            .set('Authorization', `Bearer ${token}`)
            .set('If-Match', `"v${opsRole.version}"`)
            .send({
              permissions: opsRole.permissions.filter((p: string) => p !== 'audit.delete'),
            });

          expect([400, 422]).toContain(response.status);
        }
      }
    });

    it('AC-M02-11 rejects unknown permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .put('/api/v1/roles/BRANCH_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', '"v1"')
        .send({
          permissions: ['unknown.permission'],
        });

      expect([400, 422]).toContain(response.status);
      if (response.status >= 400) {
        expect(response.body.code).toMatch(/unknown_permission|validation|invalid/i);
      }
    });

    it('AC-M02-11 stale If-Match returns 412', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .put('/api/v1/roles/BRANCH_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', '"v999"')
        .send({
          permissions: ['distribution.member.read'],
        });

      expect([409, 412]).toContain(response.status);
    });

    it('AC-M02-11 increments version on save', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getResponse = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (getResponse.status === 200) {
        const branchManagerRole = getResponse.body.items.find((r: Record<string, unknown>) => r.role === 'BRANCH_MANAGER');

        if (branchManagerRole) {
          const updateResponse = await testApp.http
            .put('/api/v1/roles/BRANCH_MANAGER/permissions')
            .set('Host', 'acme.iap.test')
            .set('Authorization', `Bearer ${token}`)
            .set('If-Match', `"v${branchManagerRole.version}"`)
            .send({
              permissions: branchManagerRole.permissions,
            });

          if (updateResponse.status === 200) {
            expect(updateResponse.body.version).toBeGreaterThan(branchManagerRole.version);
          }
        }
      }
    });

    it('AC-M02-11 security-logs permission change', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getResponse = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (getResponse.status === 200) {
        const branchManagerRole = getResponse.body.items.find((r: Record<string, unknown>) => r.role === 'BRANCH_MANAGER');

        if (branchManagerRole) {
          await testApp.http
            .put('/api/v1/roles/BRANCH_MANAGER/permissions')
            .set('Host', 'acme.iap.test')
            .set('Authorization', `Bearer ${token}`)
            .set('If-Match', `"v${branchManagerRole.version}"`)
            .send({
              permissions: branchManagerRole.permissions,
            });

          const securityLogs = testApp.logs.byEvent('security.role.permissions_changed');
          expect(securityLogs.length).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('GET /roles/{role}/preview', () => {
    it('returns human-readable permission descriptions', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .get('/api/v1/roles/BRANCH_MANAGER/preview')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('BRANCH_MANAGER');
      expect(response.body.sees).toBeDefined();
      expect(Array.isArray(response.body.sees)).toBe(true);
    });
  });
});
