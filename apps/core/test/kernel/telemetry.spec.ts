import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';

/**
 * AC-M00-24
 * Tests for POST /api/v1/telemetry/client-errors endpoint
 */
describe('client telemetry (AC-M00-24)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('POST /api/v1/telemetry/client-errors', () => {
    it('accepts up to 20 client error events', async () => {
      const events = Array.from({ length: 20 }, (_, i) => ({
        kind: 'error' as const,
        fingerprint: `error_${i}`,
        message: `Error ${i}`,
        route: '/test',
      }));

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ events });

      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(20);
    });

    it('rejects batches larger than 20 events', async () => {
      const events = Array.from({ length: 25 }, (_, i) => ({
        kind: 'error' as const,
        fingerprint: `error_${i}`,
        message: `Error ${i}`,
      }));

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ events });

      expect(response.status).toBe(400);
    });

    it('logs client errors as warn level deduped by fingerprint', async () => {
      testApp.logs.clear();

      const events = [
        {
          kind: 'error' as const,
          fingerprint: 'same_error',
          message: 'Something went wrong',
          route: '/page1',
        },
        {
          kind: 'error' as const,
          fingerprint: 'same_error',
          message: 'Something went wrong',
          route: '/page2',
        },
      ];

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ events });

      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(2);

      const clientErrorLogs = testApp.logs.byEvent('client.error');
      expect(clientErrorLogs.length).toBeGreaterThan(0);
      expect(clientErrorLogs[0].level).toBe('warn');
    });

    it('accepts vital events with name and value', async () => {
      const events = [
        {
          kind: 'vital' as const,
          name: 'LCP',
          value: 2500,
        },
        {
          kind: 'vital' as const,
          name: 'INP',
          value: 150,
        },
      ];

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ events });

      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(2);
    });

    it('records vitals as metrics', async () => {
      const events = [
        {
          kind: 'vital' as const,
          name: 'LCP',
          value: 2500,
        },
      ];

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ events });

      expect(response.status).toBe(202);

      // Verify metrics were recorded
      const metricsText = (await testApp.http.get('/metrics')).text;
      expect(metricsText).toContain('web_vital');
    });

    it('allows unauthenticated requests when tenant host resolves', async () => {
      const events = [
        {
          kind: 'error' as const,
          fingerprint: 'unauth_error',
          message: 'Client error',
        },
      ];

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .send({ events });

      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(1);
    });

    it('enforces fingerprint length limit (≤64 chars)', async () => {
      const longFingerprint = 'a'.repeat(65);

      const events = [
        {
          kind: 'error' as const,
          fingerprint: longFingerprint,
          message: 'Error',
        },
      ];

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ events });

      expect(response.status).toBe(400);
    });

    it('enforces message length limit (≤500 chars)', async () => {
      const longMessage = 'a'.repeat(501);

      const events = [
        {
          kind: 'error' as const,
          fingerprint: 'error1',
          message: longMessage,
        },
      ];

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ events });

      expect(response.status).toBe(400);
    });

    it('enforces route length limit (≤200 chars)', async () => {
      const longRoute = '/a'.repeat(101);

      const events = [
        {
          kind: 'error' as const,
          fingerprint: 'error1',
          message: 'Error',
          route: longRoute,
        },
      ];

      const response = await testApp.http
        .post('/api/v1/telemetry/client-errors')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ events });

      expect(response.status).toBe(400);
    });
  });
});
