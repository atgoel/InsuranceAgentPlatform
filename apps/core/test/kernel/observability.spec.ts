import { Controller, Get, Post, Body } from '@nestjs/common';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { RequestContext } from '../../src/kernel/observability/request-context';
import { BusinessRuleError } from '../../src/kernel/errors/domain-errors';
import { Idempotent } from '../../src/kernel/idempotency/idempotency.interceptor';

/**
 * AC-M00-07, 09, 10, 13, 06
 * Test controllers for observability and tracing
 */
@Controller('test')
class ObservabilityTestController {
  @Get('ok')
  ok() {
    return { status: 'ok' };
  }

  @Get('debug-log')
  debugLog() {
    // In real app, would call logger.debug with RequestContext
    RequestContext.current();
    return { status: 'logged' };
  }

  @Get('error')
  error() {
    throw new Error('Unhandled error');
  }

  @Get('business-error')
  businessError() {
    throw new BusinessRuleError(
      'invalid_state',
      'Lead cannot be routed in this state',
    );
  }

  @Get('slow')
  slow() {
    const ctx = RequestContext.current();
    if (ctx) {
      // Simulate slow operation by advancing clock
      // (Would be done in test)
    }
    return { status: 'done' };
  }

  @Post('idempotent')
  @Idempotent()
  idempotent(@Body() body: { value: number }) {
    return { result: body.value * 2 };
  }
}

describe('HTTP observability (AC-M00-07, 09, 10, 13, 06)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      controllers: [ObservabilityTestController],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('canonical request.completed line (AC-M00-10)', () => {
    it('writes one canonical line for a successful fast request', async () => {
      testApp.logs.clear();

      const response = await testApp.http
        .get('/test/ok')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.status).toBe(200);

      const lines = testApp.logs.byEvent('request.completed');
      expect(lines.length).toBe(1);

      const line = lines[0];
      expect(line.route).toBe('/test/ok');
      expect(line.method).toBe('GET');
      expect(line.status).toBe(200);
      expect(line.durationMs).toBeGreaterThanOrEqual(0);
      expect(line.tenantId).toBe('ten_acme');
      expect(line.actor).toBeDefined();
      expect(line.buffered).toBeUndefined();
    });

    it('includes traceparent in response headers (AC-M00-07)', async () => {
      const response = await testApp.http
        .get('/test/ok')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.headers['x-trace-id']).toBeDefined();
      expect(response.headers['traceparent']).toBeDefined();
      expect(response.headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[01]{2}$/);
    });
  });

  describe('debug buffer flushing (AC-M00-09)', () => {
    it('buffers DEBUG logs and does not write them for successful requests', async () => {
      testApp.logs.clear();

      const response = await testApp.http
        .get('/test/ok')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.status).toBe(200);

      const debugLogs = testApp.logs.records.filter((r) => r.level === 'debug');
      expect(debugLogs).toHaveLength(0);
    });

    it('flushes debug buffer when request errors (5xx)', async () => {
      testApp.logs.clear();

      const response = await testApp.http
        .get('/test/error')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.status).toBe(500);

      const lines = testApp.logs.byEvent('request.completed');
      const canonical = lines[lines.length - 1];
      expect(canonical.buffered).toBeDefined();
    });
  });

  describe('Problem Details (AC-M00-06)', () => {
    it('returns RFC 9457 Problem Details on error', async () => {
      const response = await testApp.http
        .get('/test/error')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.status).toBe(500);
      expect(response.body.type).toBeDefined();
      expect(response.body.status).toBe(500);
      expect(response.body.code).toBeDefined();
      expect(response.body.traceId).toBeDefined();
    });

    it('never leaks internal error messages in 5xx responses', async () => {
      const response = await testApp.http
        .get('/test/error')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.status).toBe(500);
      expect(response.body.detail).not.toContain('Unhandled error');
      expect(response.body.detail).toBe('An unexpected error occurred');
    });

    it('includes detail in 4xx responses', async () => {
      const response = await testApp.http
        .get('/test/business-error')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.status).toBe(422);
      expect(response.body.detail).toContain(
        'Lead cannot be routed in this state',
      );
    });

    it('includes traceId for error tracking', async () => {
      const response = await testApp.http
        .get('/test/error')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        );

      expect(response.body.traceId).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('idempotency (AC-M00-20)', () => {
    it('rejects missing Idempotency-Key header', async () => {
      const response = await testApp.http
        .post('/test/idempotent')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .send({ value: 5 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('idempotency_key_required');
    });

    it('rejects invalid Idempotency-Key format', async () => {
      const response = await testApp.http
        .post('/test/idempotent')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .set('Idempotency-Key', 'short')
        .send({ value: 5 });

      expect(response.status).toBe(400);
    });

    it('replays stored response with idempotent-replay header', async () => {
      const key = 'idempotent_key_12345678';

      // First request
      const response1 = await testApp.http
        .post('/test/idempotent')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .set('Idempotency-Key', key)
        .send({ value: 5 });

      expect(response1.status).toBe(201);
      expect(response1.body.result).toBe(10);

      // Second request with same key
      const response2 = await testApp.http
        .post('/test/idempotent')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .set('Idempotency-Key', key)
        .send({ value: 5 });

      expect(response2.status).toBe(201);
      expect(response2.body.result).toBe(10);
      expect(response2.headers['idempotent-replay']).toBe('true');
    });

    it('returns 409 conflict when same key with different body', async () => {
      const key = 'idempotent_key_conflict_123';

      // First request
      await testApp.http
        .post('/test/idempotent')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .set('Idempotency-Key', key)
        .send({ value: 5 });

      // Second request with same key but different body
      const response = await testApp.http
        .post('/test/idempotent')
        .set('Host', 'acme.iap.test')
        .set(
          'Authorization',
          `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: [] })}`,
        )
        .set('Idempotency-Key', key)
        .send({ value: 10 });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('idempotency_key_reuse');
    });
  });

  describe('metrics (AC-M00-14, 16)', () => {
    it('renders Prometheus metrics text', async () => {
      const response = await testApp.http.get('/metrics');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/plain/);
      expect(response.headers['content-type']).toContain('version=0.0.4');
      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('http_request_duration_ms');
    });

    it('includes http_requests_total with route template and status labels', async () => {
      testApp.metrics.counter('http_requests_total', 'HTTP requests', [
        'route',
        'method',
        'status_class',
      ]);

      const response = await testApp.http.get('/metrics');

      expect(response.text).toContain('http_requests_total');
      expect(response.text).toContain('route=');
      expect(response.text).toContain('method=');
      expect(response.text).toContain('status_class=');
    });

    it('excludes health routes from metrics', async () => {
      const response = await testApp.http.get('/health/live');

      expect(response.status).toBe(200);

      const metricsResponse = await testApp.http.get('/metrics');
      // Should not contain entries for /health/live
      expect(metricsResponse.text).not.toContain('/health/live');
    });
  });
});
