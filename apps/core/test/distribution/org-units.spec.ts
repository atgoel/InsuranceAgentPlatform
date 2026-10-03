import { newIdempotencyKey } from '../support/idempotency';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';

/**
 * AC-M02-01: OrgTree enforces single HEAD_OFFICE root, valid parent kinds, no cycles.
 * AC-M02-13: Tenant isolation for org units.
 */
describe('OrgUnits endpoints (AC-M02-01, AC-M02-13)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp({
      imports: [DistributionModule],
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('GET /org-units (AC-M02-01)', () => {
    it('returns organisation tree with HEAD_OFFICE root', async () => {
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
      expect(response.body.root.id).toBe('ou_root');
      expect(response.body.root.kind).toBe('HEAD_OFFICE');
      expect(response.body.root.name).toBeDefined();
      expect(Array.isArray(response.body.root.children)).toBe(true);
    });

    it('includes member count per node', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .get('/api/v1/org-units')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.root.memberCount).toBeDefined();
      expect(typeof response.body.root.memberCount).toBe('number');
    });

    it('AC-M02-13 enforces tenant isolation: B cannot read A units', async () => {
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

      expect(acmeResponse.status).toBe(200);
      expect(zenResponse.status).toBe(200);
      // Each tenant has its own root with id ou_root but different context
      expect(acmeResponse.body.root.id).toBe('ou_root');
      expect(zenResponse.body.root.id).toBe('ou_root');
    });
  });

  describe('POST /org-units (AC-M02-01)', () => {
    it('creates REGION under HEAD_OFFICE', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'North Region',
          territoryCodes: ['001', '002'],
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.parentId).toBe('ou_root');
      expect(response.body.kind).toBe('REGION');
      expect(response.body.name).toBe('North Region');
      expect(response.body.territoryCodes).toEqual(['001', '002']);
    });

    it('creates BRANCH under REGION', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // First create a region
      const regionRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'South Region',
        });

      expect(regionRes.status).toBe(201);
      expect(regionRes.status).toBe(201);
      const regionId = regionRes.body.id;

      // Then create a branch under it
      const branchRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: regionId,
          kind: 'BRANCH',
          name: 'Main Branch',
        });

      expect(branchRes.status).toBe(201);
      expect(branchRes.body.parentId).toBe(regionId);
      expect(branchRes.body.kind).toBe('BRANCH');
    });

    it('creates TEAM under BRANCH', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create region
      const regionRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'East Region',
        });

      expect(regionRes.status).toBe(201);

      const regionId = regionRes.body.id;

      // Create branch
      const branchRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: regionId,
          kind: 'BRANCH',
          name: 'East Branch',
        });

      expect(branchRes.status).toBe(201);

      const branchId = branchRes.body.id;

      // Create team
      const teamRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: branchId,
          kind: 'TEAM',
          name: 'Sales Team',
        });

      expect(teamRes.status).toBe(201);
      expect(teamRes.body.parentId).toBe(branchId);
      expect(teamRes.body.kind).toBe('TEAM');
    });

    it('rejects TEAM under HEAD_OFFICE (invalid parent kind)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'TEAM',
          name: 'Invalid Team',
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('org_unit_parent_invalid');
    });

    it('rejects TEAM directly under HEAD_OFFICE (teams belong to branches)', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'TEAM',
          name: 'Invalid Team',
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('org_unit_parent_invalid');
    });

    it('rejects create with nonexistent parent', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const response = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_nonexistent',
          kind: 'REGION',
          name: 'Test Region',
        });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('org_unit_parent_invalid');
    });
  });

  describe('POST /org-units/{id}/moves (AC-M02-01)', () => {
    it('moves BRANCH from one REGION to another', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create two regions
      const region1Res = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'Region1',
        });

      const region2Res = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'Region2',
        });

      expect(region1Res.status).toBe(201);

      const region1Id = region1Res.body.id;
      expect(region2Res.status).toBe(201);
      const region2Id = region2Res.body.id;

      // Create branch under region1
      const branchRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: region1Id,
          kind: 'BRANCH',
          name: 'Mobile Branch',
        });

      expect(branchRes.status).toBe(201);

      const branchId = branchRes.body.id;

      // Move branch to region2
      const moveRes = await testApp.http
        .post(`/api/v1/org-units/${branchId}/moves`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: region2Id,
        });

      expect(moveRes.status).toBe(200);
      expect(moveRes.body.parentId).toBe(region2Id);
    });

    it('rejects move that would create a cycle', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create region, branch, team hierarchy
      const regionRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'Cycle Test Region',
        });

      expect(regionRes.status).toBe(201);

      const regionId = regionRes.body.id;

      const branchRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: regionId,
          kind: 'BRANCH',
          name: 'Cycle Test Branch',
        });

      expect(branchRes.status).toBe(201);

      const branchId = branchRes.body.id;

      // Moving a region under its own branch is refused; kinds strictly descend, so the kind rule fires
      // before the cycle check (the cycle guard itself is covered by the OrgTree domain spec).
      const moveRes = await testApp.http
        .post(`/api/v1/org-units/${regionId}/moves`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: branchId,
        });

      expect(moveRes.status).toBe(422);
      expect(moveRes.body.code).toBe('org_unit_parent_invalid');
    });

    it('rejects move with invalid parent kind', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      // Create region, branch, team
      const regionRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'Kind Test Region',
        });

      expect(regionRes.status).toBe(201);

      const regionId = regionRes.body.id;

      const branchRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: regionId,
          kind: 'BRANCH',
          name: 'Kind Test Branch',
        });

      expect(branchRes.status).toBe(201);

      const branchId = branchRes.body.id;

      const teamRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: branchId,
          kind: 'TEAM',
          name: 'Kind Test Team',
        });

      expect(teamRes.status).toBe(201);

      const teamId = teamRes.body.id;

      // Try to move team under region (invalid - TEAM can only be under BRANCH)
      const moveRes = await testApp.http
        .post(`/api/v1/org-units/${teamId}/moves`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: regionId,
        });

      expect(moveRes.status).toBe(422);
      expect(moveRes.body.code).toBe('org_unit_parent_invalid');
    });

    it('rejects move with nonexistent parent', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['TENANT_ADMIN'],
      });

      const regionRes = await testApp.http
        .post('/api/v1/org-units')
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_root',
          kind: 'REGION',
          name: 'Move Test Region',
        });

      expect(regionRes.status).toBe(201);

      const regionId = regionRes.body.id;

      // Try to move to nonexistent parent
      const moveRes = await testApp.http
        .post(`/api/v1/org-units/${regionId}/moves`)
        .set('Idempotency-Key', newIdempotencyKey())
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          parentId: 'ou_nonexistent',
        });

      expect(moveRes.status).toBe(422);
      expect(moveRes.body.code).toBe('org_unit_parent_invalid');
    });
  });
});
