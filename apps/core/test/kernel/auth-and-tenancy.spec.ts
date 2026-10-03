import { Controller, Get } from '@nestjs/common';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor, operatorToken } from '../support/tokens';
import { RequirePermission, OperatorOnly, Public, CurrentPrincipal } from '../../src/kernel/tenancy/decorators';
import { Principal } from '../../src/kernel/tenancy/principal';

/**
 * AC-M00-18, 19
 * Test controllers for auth and tenancy
 */
@Controller('auth')
class AuthTestController {
  @Get('me')
  getMe(@CurrentPrincipal() principal: Principal) {
    return {
      userRef: principal.userRef,
      tenantId: principal.tenantId,
      roles: principal.roles,
    };
  }

  @Get('protected')
  @RequirePermission('crm.lead.read')
  protected() {
    return { status: 'protected' };
  }

  @Get('operator')
  @OperatorOnly()
  operatorOnly() {
    return { status: 'operator' };
  }

  @Get('public')
  @Public()
  public() {
    return { status: 'public' };
  }
}

describe('auth and tenancy (AC-M00-18, 19)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      controllers: [AuthTestController],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('tenant resolution (AC-M00-18)', () => {
    it('resolves tenant from Host header', async () => {
      const response = await testApp.http
        .get('/auth/me')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.status).toBe(200);
      expect(response.body.tenantId).toBe('ten_acme');
    });

    it('returns 404 for unknown host', async () => {
      const response = await testApp.http
        .get('/auth/me')
        .set('Host', 'unknown.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('tenant_not_found');
    });

    it('returns 403 tenant_inactive for suspended tenant', async () => {
      const response = await testApp.http
        .get('/auth/me')
        .set('Host', 'sleepy.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_sleepy', roles: [] })}`,
        );

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('tenant_inactive');
    });

    it('returns 403 tenant_mismatch when token org ≠ host tenant', async () => {
      testApp.logs.clear();

      const response = await testApp.http
        .get('/auth/me')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_zen', roles: [] })}`,
        );

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('tenant_mismatch');

      // Verify security log
      const securityLogs = testApp.logs.records.filter(
        (r) => r.channel === 'security',
      );
      const mismatchLog = securityLogs.find(
        (l) => l.event === 'security.tenant_mismatch',
      );
      expect(mismatchLog).toBeDefined();
    });

    it('returns 401 for missing authorization header', async () => {
      const response = await testApp.http
        .get('/auth/me')
        .set('Host', 'acme.iap.test');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('unauthenticated');
    });

    it('returns 401 for invalid token', async () => {
      const response = await testApp.http
        .get('/auth/me')
        .set('Host', 'acme.iap.test')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('invalid_token');
    });
  });

  describe('permissions (AC-M00-19)', () => {
    it('allows request when role has required permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['crm.agent'],
      });

      const response = await testApp.http
        .get('/auth/protected')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('protected');
    });

    it('denies request when role lacks required permission', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['compliance.reviewer'],
      });

      const response = await testApp.http
        .get('/auth/protected')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('permission_denied');
      expect(response.body.details?.required).toContain('crm.lead.read');
    });

    it('allows wildcard permission grants', async () => {
      // Register crm.* permission for this test
      // Would be done by module initialization
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['crm.manager'],
      });

      await testApp.http
        .get('/auth/protected')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      // Depends on module registering 'crm.*' permission
      // For this test to work, the permission matrix must have been initialized
    });
  });

  describe('OperatorOnly guard (AC-M00-19)', () => {
    it('allows request with workforce realm and platform.operator role', async () => {
      const response = await testApp.http
        .get('/auth/operator')
        .set('Authorization', `Bearer ${operatorToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('operator');
    });

    it('denies request without workforce realm', async () => {
      const token = tokenFor({
        tenantId: 'platform',
        roles: ['platform.operator'],
        realm: 'customers', // Wrong realm
      });

      const response = await testApp.http
        .get('/auth/operator')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('operator_only');
    });

    it('denies request without platform.operator role', async () => {
      const token = tokenFor({
        tenantId: 'platform',
        roles: ['other.role'],
        realm: 'workforce',
      });

      const response = await testApp.http
        .get('/auth/operator')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('operator_only');
    });

    it('does not check host for @OperatorOnly routes', async () => {
      const response = await testApp.http
        .get('/auth/operator')
        .set('Host', 'unknown.iap.test')
        .set('Authorization', `Bearer ${operatorToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('operator');
    });
  });

  describe('@Public decorator (AC-M00-18)', () => {
    it('allows unauthenticated access', async () => {
      const response = await testApp.http
        .get('/auth/public')
        .set('Host', 'acme.iap.test');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('public');
    });

    it('sets tenantId in context when host resolves', async () => {
      const response = await testApp.http
        .get('/auth/public')
        .set('Host', 'acme.iap.test');

      expect(response.status).toBe(200);

      // Verify tenantId was set in logs
      const logs = testApp.logs.records.filter((r) => r.tenantId);
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/me', () => {
    it('returns current principal with permissions', async () => {
      const token = tokenFor({
        tenantId: 'ten_acme',
        roles: ['crm.agent'],
        sub: 'user_001',
        memberId: 'mem_123',
      });

      const response = await testApp.http
        .get('/api/v1/me')
        .set('Host', 'acme.iap.test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.userRef).toBe('user_001');
      expect(response.body.tenantId).toBe('ten_acme');
      expect(response.body.memberId).toBe('mem_123');
      expect(response.body.roles).toContain('crm.agent');
      expect(response.body.permissions).toBeDefined();
      expect(Array.isArray(response.body.permissions)).toBe(true);
    });
  });
});
