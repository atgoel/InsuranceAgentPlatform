import { BadRequestException, Controller, Get, Inject } from '@nestjs/common';
import { createTestApp, TestApp } from '../support/test-app';
import { Public } from '../../src/kernel/tenancy/decorators';
import { DependencyUnavailableError, RateLimitedError } from '../../src/kernel/errors/domain-errors';
import { LOGGER } from '../../src/kernel/tokens';
import { Logger } from '../../src/kernel/observability/logger';

@Controller('filter-test')
@Public()
class FilterTestController {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  @Get('crash')
  crash(): never {
    this.logger.debug('test.step', 'about to fail', { step: 1 });
    throw new Error('db password=hunter2 exploded');
  }

  @Get('limited')
  limited(): never {
    throw new RateLimitedError('usage_limit_exceeded', 'Limit reached', { retryAfterSeconds: 120 });
  }

  @Get('down')
  down(): never {
    throw new DependencyUnavailableError('twenty');
  }

  @Get('bad')
  bad(): never {
    throw new BadRequestException('nope');
  }
}

describe('AC-M00-06 ProblemDetailsFilter behaviour (architect regression tests)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [FilterTestController] });
  });

  afterAll(() => t.close());
  beforeEach(() => t.logs.clear());

  it('AC-M00-06 logs an unhandled error once with type and fingerprint, never the raw message in the response', async () => {
    const res = await t.http.get('/filter-test/crash');

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('internal_error');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    const errors = t.logs.byEvent('http.unhandled_error');
    expect(errors).toHaveLength(1);
    expect(errors[0].err?.type).toBe('Error');
    expect(errors[0].err?.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(errors[0].traceId).toBe(res.body.traceId);
    expect(JSON.stringify(errors[0])).not.toContain('hunter2');
  });

  it('AC-M00-09 a 5xx flushes the buffered debug trail into the canonical line', async () => {
    const res = await t.http.get('/filter-test/crash');

    const line = t.logs.byEvent('request.completed').find((r) => r.traceId === res.body.traceId);
    expect(line?.flushReason).toBe('error');
    expect(line?.buffered?.some((e) => e.event === 'test.step')).toBe(true);
  });

  it('AC-M00-06 sets Retry-After from RateLimitedError details', async () => {
    const res = await t.http.get('/filter-test/limited');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('120');
    expect(t.logs.byEvent('http.unhandled_error')).toHaveLength(0);
  });

  it('AC-M00-06 defaults Retry-After to 30 s for an unavailable dependency', async () => {
    const res = await t.http.get('/filter-test/down');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('dependency_unavailable');
    expect(res.headers['retry-after']).toBe('30');
  });

  it('AC-M00-06 keeps the status of Nest HTTP exceptions', async () => {
    const res = await t.http.get('/filter-test/bad');

    expect(res.status).toBe(400);
    expect(res.body.traceId).toBeDefined();
  });
});
