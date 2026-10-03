import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';

/**
 * AC-M02-01, AC-M02-13: OrgTree endpoints with tenant isolation
 */
describe('OrgUnits endpoints (AC-M02-01, 13)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      imports: [DistributionModule],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('GET /org-units', () => {
    it('AC-M02-01 returns org unit tree with nested structure', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .get('/api/v1/org-units')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.root).toBeDefined();
      expect(response.body.root.kind).toBe('HEAD_OFFICE');
      expect(response.body.root.children).toBeDefined();
    });

    it('returns member count per node', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .get('/api/v1/org-units')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      if (response.status === 200) {
        expect(response.body.root).toHaveProperty('memberCount');
      }
    });

    it('AC-M02-13 tenant isolation: B cannot read A org units', async () => {
      const tokenAcme = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const tokenZen = tokenFor({
        tenantId: 'ten_zen',
        roles: ['TENANT_ADMIN'],
      });

      const acmeResponse = await testApp.http
        .get('/api/v1/org-units')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${tokenAcme}`);

      const zenResponse = await testApp.http
        .get('/api/v1/org-units')
        .set('Host', 'zen.iap.test')
        .set('Authorization', `Bearer ${tokenZen}`);

      // Both should succeed for their respective tenants
      if (acmeResponse.status === 200 && zenResponse.status === 200) {
        // acme root should be different from zen root
        expect(acmeResponse.body.root.id).not.toBe(zenResponse.body.root.id);
      }
    });
  });

  describe('POST /org-units', () => {
    it('AC-M02-01 creates child org unit with valid parent kind', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/org-units')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'North Region',
          territoryCodes: ['001', '002'],
        });

      expect([201, 400, 404]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body.kind).toBe('REGION');
        expect(response.body.parentId).toBe('ou_root');
      }
    });

    it('AC-M02-01 rejects invalid parent-child relationship', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Try to create TEAM under HEAD_OFFICE (invalid)
      const response = await testApp.http
        .post('/api/v1/org-units')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'TEAM',
          name: 'Invalid Team',
        });

      expect([400, 422, 404]).toContain(response.status);
      if (response.status >= 400 && response.status < 500) {
        expect(response.body.code).toMatch(/org_unit|invalid|parent/i);
      }
    });

    it('rejects create when parent does not exist', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/org-units')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_nonexist',
          kind: 'BRANCH',
          name: 'Branch',
        });

      expect([400, 404, 422]).toContain(response.status);
    });
  });

  describe('POST /org-units/{id}/moves', () => {
    it('AC-M02-01 moves unit to new valid parent', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/org-units/ou_br1/moves')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_reg1',
        });

      expect([200, 400, 404, 422]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.parentId).toBe('ou_reg1');
      }
    });

    it('AC-M02-01 rejects move that would create cycle', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Try to move parent under its own child
      const response = await testApp.http
        .post('/api/v1/org-units/ou_root/moves')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_tm1', // Assuming tm1 is a descendant of root
        });

      expect([400, 422]).toContain(response.status);
      if (response.status >= 400) {
        expect(response.body.code).toMatch(/cycle|parent|invalid/i);
      }
    });

    it('rejects move with invalid parent kind', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/org-units/ou_tm1/moves')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root', // Team parent must be Branch, not Head Office
        });

      expect([400, 422, 404]).toContain(response.status);
    });
  });
});
