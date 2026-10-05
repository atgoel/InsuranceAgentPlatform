import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TenancyModule } from '../../src/modules/tenancy/tenancy.module';
import { createTestApp, TestApp } from '../support/test-app';
import { operatorToken, tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

/** AC-M01-21 GET /tenant/entitlements returns plan.canHidePoweredBy (ADR-009). */
describe('AC-M01-21 entitlements canHidePoweredBy', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [TenancyModule] });
  });

  afterAll(async () => {
    await testApp.close();
  });

  const entitlements = (tenantId: string, host: string) =>
    testApp.http
      .get('/api/v1/tenant/entitlements')
      .set('Host', host)
      .set('Authorization', `Bearer ${tokenFor({ tenantId, roles: ['TENANT_ADMIN'] })}`);

  const provision = (slug: string, planCode: string) =>
    testApp.http
      .post('/api/v1/ops/tenants')
      .set('Idempotency-Key', newIdempotencyKey())
      .set('Authorization', `Bearer ${operatorToken()}`)
      .send({
        slug,
        displayName: slug,
        kind: 'ORGANISATION',
        planCode,
        entity: {
          entityType: 'IMF',
          legalName: 'Test Corp Ltd',
          registrationNo: `${slug.toUpperCase()}-1`,
          registrationValidTo: '2028-06-30',
          principalOfficerName: 'Jane Smith',
        },
        admin: { name: 'Jane', email: 'jane@acme.test' },
      });

  it('AC-M01-21 a plan that cannot hide the badge reports false', async () => {
    const res = await provision('badge-team', 'TEAM');
    expect(res.status).toBe(201);
    const response = await entitlements(res.body.tenantId, 'badge-team.iap.test');
    expect(response.status).toBe(200);
    expect(response.body.plan.code).toBe('TEAM');
    expect(response.body.plan.canHidePoweredBy).toBe(false);
  });

  it('AC-M01-21 a white-label plan reports true', async () => {
    const res = await provision('badge-wl', 'WHITE_LABEL');
    expect(res.status).toBe(201);
    const response = await entitlements(res.body.tenantId, 'badge-wl.iap.test');
    expect(response.status).toBe(200);
    expect(response.body.plan.code).toBe('WHITE_LABEL');
    expect(response.body.plan.canHidePoweredBy).toBe(true);
  });
});
