import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';

/**
 * AC-M02-11: Role editor with locked permissions, version control, permission validation
 * AC-M02-13: Tenant isolation
 */
describe('Roles endpoints (AC-M02-11, AC-M02-13)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp({
      imports: [DistributionModule],
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('GET /roles', () => {
    it('lists all roles with version and record scope', async () => {
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
      expect(response.body.items.length).toBeGreaterThan(0);

      const adminRole = response.body.items.find((r: Record<string, unknown>) => r.role === 'TENANT_ADMIN');
      expect(adminRole).toBeDefined();
      expect(adminRole.version).toBeDefined();
      expect(adminRole.permissions).toBeDefined();
      expect(adminRole.recordScope).toBeDefined();
      expect(adminRole.privileged).toBeDefined();
      expect(adminRole.editable).toBeDefined();
      expect(adminRole.etag).toBeDefined();
    });

    it('AC-M02-13 tenant isolation: each tenant has separate role catalogue', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const tokenZen = tokenFor({
        tenantId: 'ten_zen',
        roles: ['TENANT_ADMIN'],
      });

      const acmeRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`);

      const zenRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`);

      expect(acmeRes.status).toBe(200);
      expect(zenRes.status).toBe(200);

      // Default versions should be 1 initially
      const acmeAdmin = acmeRes.body.items.find((r: Record<string, unknown>) => r.role === 'TENANT_ADMIN');
      const zenAdmin = zenRes.body.items.find((r: Record<string, unknown>) => r.role === 'TENANT_ADMIN');

      expect(acmeAdmin.version).toBe(zenAdmin.version);
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
      expect(response.body.sees.length).toBeGreaterThan(0);
    });

    it('returns preview for each role', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const roles = ['TENANT_ADMIN', 'BRANCH_MANAGER', 'SALESPERSON', 'OPS'];

      for (const roleName of roles) {
        const response = await testApp.http
          .get(`/api/v1/roles/${roleName}/preview`)
          .set('Host', 'acme.iap.test')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.role).toBe(roleName);
        expect(Array.isArray(response.body.sees)).toBe(true);
      }
    });
  });

  describe('PUT /roles/{role}/permissions (AC-M02-11)', () => {
    it('updates editable role permissions and increments version', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Get current BRANCH_MANAGER
      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const branchManager = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'BRANCH_MANAGER');
      const oldVersion = branchManager.version;

      // Update with same permissions
      const updateRes = await testApp.http
        .put('/api/v1/roles/BRANCH_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${oldVersion}"`)
        .send({
          permissions: branchManager.permissions,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.version).toBe(oldVersion + 1);
      expect(updateRes.body.etag).toBe(`"v${oldVersion + 1}"`);
    });

    it('rejects non-editable role (TENANT_ADMIN) with role_not_editable', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Get current version
      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const adminRole = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'TENANT_ADMIN');

      const updateRes = await testApp.http
        .put('/api/v1/roles/TENANT_ADMIN/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${adminRole.version}"`)
        .send({
          permissions: adminRole.permissions,
        });

      expect(updateRes.status).toBe(422);
      expect(updateRes.body.code).toBe('role_not_editable');
    });

    it('rejects adding locked permission (party.medical.read)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const branchManager = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'BRANCH_MANAGER');

      const updateRes = await testApp.http
        .put('/api/v1/roles/BRANCH_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${branchManager.version}"`)
        .send({
          permissions: [...branchManager.permissions, 'party.medical.read'],
        });

      expect(updateRes.status).toBe(422);
      expect(updateRes.body.code).toBe('permission_locked');
    });

    it('rejects adding locked permission (audit.delete)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const salesManager = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'SALES_MANAGER');

      const updateRes = await testApp.http
        .put('/api/v1/roles/SALES_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${salesManager.version}"`)
        .send({
          permissions: [...salesManager.permissions, 'audit.delete'],
        });

      expect(updateRes.status).toBe(422);
      expect(updateRes.body.code).toBe('permission_locked');
    });

    it('rejects adding locked permission (ops.*)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const salesperson = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'SALESPERSON');

      const updateRes = await testApp.http
        .put('/api/v1/roles/SALESPERSON/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${salesperson.version}"`)
        .send({
          permissions: [...salesperson.permissions, 'ops.*'],
        });

      expect(updateRes.status).toBe(422);
      expect(updateRes.body.code).toBe('permission_locked');
    });

    it('rejects removing locked permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const ops = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'OPS');
      const hasOpsWildcard = ops.permissions.some((p: string) => p.startsWith('ops'));

      if (hasOpsWildcard) {
        // Try to remove ops.* permission
        const permsWithoutOps = ops.permissions.filter((p: string) => !p.startsWith('ops'));

        const updateRes = await testApp.http
          .put('/api/v1/roles/OPS/permissions')
          .set('Host', 'acme.iap.test')
          .set('Authorization', `Bearer ${token}`)
          .set('If-Match', `"v${ops.version}"`)
          .send({
            permissions: permsWithoutOps,
          });

        expect(updateRes.status).toBe(422);
        expect(updateRes.body.code).toBe('permission_locked');
      }
    });

    it('rejects unknown permission with unknown_permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const branchManager = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'BRANCH_MANAGER');

      const updateRes = await testApp.http
        .put('/api/v1/roles/BRANCH_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${branchManager.version}"`)
        .send({
          permissions: [...branchManager.permissions, 'this.permission.does.not.exist'],
        });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.code).toBe('unknown_permission');
    });

    it('rejects stale If-Match with 412', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const branchManager = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'BRANCH_MANAGER');

      const updateRes = await testApp.http
        .put('/api/v1/roles/BRANCH_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', '"v999"')
        .send({
          permissions: branchManager.permissions,
        });

      expect(updateRes.status).toBe(412);
    });

    it('increments version on each successful update', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Get initial version
      const getRes1 = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const sales1 = getRes1.body.items.find((r: Record<string, unknown>) => r.role === 'SALES_MANAGER');
      const v1 = sales1.version;

      // First update
      const update1 = await testApp.http
        .put('/api/v1/roles/SALES_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${v1}"`)
        .send({
          permissions: sales1.permissions,
        });

      expect(update1.status).toBe(200);
      expect(update1.body.version).toBe(v1 + 1);

      // Second update with new version
      const update2 = await testApp.http
        .put('/api/v1/roles/SALES_MANAGER/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${v1 + 1}"`)
        .send({
          permissions: update1.body.permissions,
        });

      expect(update2.status).toBe(200);
      expect(update2.body.version).toBe(v1 + 2);
    });

    it('records security log for permission change', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Clear logs
      testApp.logs.clear();

      const getRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      const compliance = getRes.body.items.find((r: Record<string, unknown>) => r.role === 'COMPLIANCE');

      // Update to trigger logging
      await testApp.http
        .put('/api/v1/roles/COMPLIANCE/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .set('If-Match', `"v${compliance.version}"`)
        .send({
          permissions: compliance.permissions,
        });

      // Check for security log
      const securityLogs = testApp.logs.byEvent('security.role.permissions_changed');
      expect(securityLogs.length).toBeGreaterThan(0);
    });

    it('tenant isolation: edits do not affect other tenants', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const tokenZen = tokenFor({
        tenantId: 'ten_zen',
        roles: ['TENANT_ADMIN'],
      });

      // Get acme version
      const acmeGetRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`);

      const acmeFinance = acmeGetRes.body.items.find((r: Record<string, unknown>) => r.role === 'FINANCE');
      const acmeV1 = acmeFinance.version;

      // Update in acme
      const acmeUpdateRes = await testApp.http
        .put('/api/v1/roles/FINANCE/permissions')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`)
        .set('If-Match', `"v${acmeV1}"`)
        .send({
          permissions: acmeFinance.permissions,
        });

      expect(acmeUpdateRes.status).toBe(200);
      expect(acmeUpdateRes.body.version).toBe(acmeV1 + 1);

      // Zen should still be at version 1
      const zenGetRes = await testApp.http
        .get('/api/v1/roles')
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`);

      const zenFinance = zenGetRes.body.items.find((r: Record<string, unknown>) => r.role === 'FINANCE');
      expect(zenFinance.version).toBe(1);
    });
  });
});
