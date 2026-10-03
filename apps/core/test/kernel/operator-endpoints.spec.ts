import { createTestApp, TestApp } from '../support/test-app';
import { operatorToken } from '../support/tokens';
import { tokenFor } from '../support/tokens';

/**
 * AC-M00-12, 25
 * Tests for operator endpoints: log overrides and dev tokens
 */
describe('operator endpoints (AC-M00-12, 25)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('PUT /api/v1/ops/log-overrides (AC-M00-12)', () => {
    it('creates a log override for a tenant', async () => {
      testApp.logs.clear();

      const response = await testApp.http
        .put('/api/v1/ops/log-overrides')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          scope: { tenantId: 'ten_acme' },
          ttlMinutes: 15,
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.scope.tenantId).toBe('ten_acme');
      expect(response.body.level).toBe('debug');

      // Verify security log
      const securityLogs = testApp.logs.records.filter(
        (r) => r.event === 'security.log_override.created',
      );
      expect(securityLogs.length).toBeGreaterThan(0);
    });

    it('creates override for a module', async () => {
      const response = await testApp.http
        .put('/api/v1/ops/log-overrides')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          scope: { module: 'crm' },
          ttlMinutes: 30,
        });

      expect(response.status).toBe(201);
      expect(response.body.scope.module).toBe('crm');
    });

    it('creates override for an actor', async () => {
      const response = await testApp.http
        .put('/api/v1/ops/log-overrides')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          scope: { actor: 'usr_12345678' },
          ttlMinutes: 10,
        });

      expect(response.status).toBe(201);
      expect(response.body.scope.actor).toBe('usr_12345678');
    });

    it('rejects ttl > 60 minutes', async () => {
      const response = await testApp.http
        .put('/api/v1/ops/log-overrides')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          scope: { tenantId: 'ten_acme' },
          ttlMinutes: 61,
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('override_ttl_invalid');
    });

    it('rejects empty scope', async () => {
      const response = await testApp.http
        .put('/api/v1/ops/log-overrides')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          scope: {},
          ttlMinutes: 30,
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('override_scope_required');
    });

    it('denies non-operator', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['crm.agent'],
      });

      const response = await testApp.http
        .put('/api/v1/ops/log-overrides')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          scope: { tenantId: 'ten_acme' },
          ttlMinutes: 15,
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('permission_denied');
    });
  });

  describe('GET /api/v1/ops/log-overrides', () => {
    it('lists active log overrides', async () => {
      // Create an override
      await testApp.http
        .put('/api/v1/ops/log-overrides')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          scope: { tenantId: 'ten_acme' },
          ttlMinutes: 15,
        });

      const response = await testApp.http
        .get('/api/v1/ops/log-overrides')
        .set('Authorization', `Bearer ${operatorToken()}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThan(0);
    });

    it('denies non-operator', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['crm.agent'],
      });

      const response = await testApp.http
        .get('/api/v1/ops/log-overrides')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/ops/log-overrides/:id', () => {
    it('deletes a log override', async () => {
      const createResponse = await testApp.http
        .put('/api/v1/ops/log-overrides')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          scope: { tenantId: 'ten_acme' },
          ttlMinutes: 15,
        });

      const overrideId = createResponse.body.id;

      const deleteResponse = await testApp.http
        .delete(`/api/v1/ops/log-overrides/${overrideId}`)
        .set('Authorization', `Bearer ${operatorToken()}`);

      expect(deleteResponse.status).toBe(204);
    });

    it('returns 404 for non-existent override', async () => {
      const response = await testApp.http
        .delete('/api/v1/ops/log-overrides/nonexistent')
        .set('Authorization', `Bearer ${operatorToken()}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/ops/debug-tokens (AC-M00-13)', () => {
    it('issues a debug token with 15-minute TTL', async () => {
      const response = await testApp.http
        .post('/api/v1/ops/debug-tokens')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          tenantId: 'ten_acme',
          ttlMinutes: 15,
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      // Verify security log
      const securityLogs = testApp.logs.records.filter(
        (r) => r.event === 'security.debug_token.issued',
      );
      expect(securityLogs.length).toBeGreaterThan(0);
    });

    it('rejects ttl > 15 minutes', async () => {
      const response = await testApp.http
        .post('/api/v1/ops/debug-tokens')
        .set('Authorization', `Bearer ${operatorToken()}`)
        .send({
          tenantId: 'ten_acme',
          ttlMinutes: 16,
        });

      expect(response.status).toBe(400);
    });

    it('denies non-operator', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['crm.agent'],
      });

      const response = await testApp.http
        .post('/api/v1/ops/debug-tokens')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`)
        .send({
          tenantId: 'ten_acme',
          ttlMinutes: 15,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/dev/tokens (AC-M00-25)', () => {
    it('issues a token when dev auth is enabled', async () => {
      const response = await testApp.http
        .post('/api/v1/dev/tokens')
        .send({
          tenantId: 'ten_acme',
          roles: ['crm.agent'],
          sub: 'dev_user',
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it('returns 404 when dev auth is disabled', async () => {
      const testAppProd = await createTestApp({
        config: { devAuth: false },
      });

      const response = await testAppProd.http
        .post('/api/v1/dev/tokens')
        .send({
          tenantId: 'ten_acme',
          roles: ['crm.agent'],
        });

      expect(response.status).toBe(404);

      await testAppProd.close();
    });

    it('includes roles in the issued token', async () => {
      const response = await testApp.http
        .post('/api/v1/dev/tokens')
        .send({
          tenantId: 'ten_acme',
          roles: ['crm.agent', 'crm.manager'],
        });

      expect(response.status).toBe(200);

      // The token can be used in a subsequent request
      const meResponse = await testApp.http
        .get('/api/v1/me')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${response.body.token}`);

      expect(meResponse.status).toBe(200);
      expect(meResponse.body.roles).toContain('crm.agent');
      expect(meResponse.body.roles).toContain('crm.manager');
    });

    it('accepts optional memberId and orgUnitId', async () => {
      const response = await testApp.http
        .post('/api/v1/dev/tokens')
        .send({
          tenantId: 'ten_acme',
          roles: ['crm.agent'],
          memberId: 'mem_123',
          orgUnitId: 'unit_456',
        });

      expect(response.status).toBe(200);

      const meResponse = await testApp.http
        .get('/api/v1/me')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${response.body.token}`);

      expect(meResponse.body.memberId).toBe('mem_123');
      expect(meResponse.body.orgUnitId).toBe('unit_456');
    });
  });
});
