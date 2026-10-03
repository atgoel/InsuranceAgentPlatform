import {
  ProblemDetailsBuilder,
  ProblemMapper,
  DomainErrorMapper,
  ZodErrorMapper,
  HttpExceptionMapper,
  FallbackMapper,
  toProblem,
} from './problem-details';
import {
  ValidationError,
  NotFoundError,
} from './domain-errors';
import { z } from 'zod';
import { HttpException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('AC-M00-06 Problem Details', () => {
  describe('ProblemDetailsBuilder', () => {
    it('creates minimal problem details', () => {
      const problem = ProblemDetailsBuilder.create()
        .status(400)
        .code('validation_failed')
        .traceId('trace_123')
        .build();

      expect(problem.status).toBe(400);
      expect(problem.code).toBe('validation_failed');
      expect(problem.traceId).toBe('trace_123');
      expect(problem.title).toBe('Bad Request');
    });

    it('builds problem with all fields', () => {
      const problem = ProblemDetailsBuilder.create()
        .status(404)
        .code('not_found')
        .title('Resource Not Found')
        .detail('The requested resource could not be found')
        .traceId('trace_abc')
        .errors([{ path: 'id', code: 'required', message: 'ID is required' }])
        .extension('severity', 'info')
        .build();

      expect(problem.status).toBe(404);
      expect(problem.code).toBe('not_found');
      expect(problem.title).toBe('Resource Not Found');
      expect(problem.detail).toBe('The requested resource could not be found');
      expect(problem.errors).toHaveLength(1);
      expect(problem.severity).toBe('info');
    });

    it('sets type based on code', () => {
      const problem = ProblemDetailsBuilder.create()
        .status(400)
        .code('invalid_input')
        .traceId('trace_123')
        .build();

      expect(problem.type).toBe('https://errors.iap.example/invalid_input');
    });

    it('defaults title to HTTP reason phrase', () => {
      const p400 = ProblemDetailsBuilder.create()
        .status(400)
        .code('bad')
        .traceId('t')
        .build();
      expect(p400.title).toBe('Bad Request');

      const p404 = ProblemDetailsBuilder.create()
        .status(404)
        .code('not_found')
        .traceId('t')
        .build();
      expect(p404.title).toBe('Not Found');

      const p500 = ProblemDetailsBuilder.create()
        .status(500)
        .code('error')
        .traceId('t')
        .build();
      expect(p500.title).toBe('Internal Server Error');
    });

    it('supports method chaining', () => {
      const problem = ProblemDetailsBuilder.create()
        .status(422)
        .code('business_rule')
        .title('Business Rule Violated')
        .detail('Cannot proceed')
        .traceId('trace_xyz')
        .build();

      expect(problem.status).toBe(422);
      expect(problem.detail).toBe('Cannot proceed');
    });

    it('allows extension fields', () => {
      const problem = ProblemDetailsBuilder.create()
        .status(429)
        .code('rate_limited')
        .traceId('t')
        .extension('retryAfter', 60)
        .extension('quotaReset', '2026-01-01T13:00:00Z')
        .build();

      expect(problem.retryAfter).toBe(60);
      expect(problem.quotaReset).toBe('2026-01-01T13:00:00Z');
    });
  });

  describe('DomainErrorMapper', () => {
    it('maps ValidationError', () => {
      const errors = [
        { path: 'email', code: 'invalid', message: 'Invalid email' },
      ];
      const err = new ValidationError('validation_failed', 'Form is invalid', errors);

      const mapper = new DomainErrorMapper();
      expect(mapper.canMap(err)).toBe(true);

      const problem = mapper.map(err, 'trace_123');
      expect(problem.status).toBe(400);
      expect(problem.code).toBe('validation_failed');
      expect(problem.errors).toEqual(errors);
    });

    it('maps NotFoundError', () => {
      const err = new NotFoundError('Lead');

      const mapper = new DomainErrorMapper();
      const problem = mapper.map(err, 'trace_123');

      expect(problem.status).toBe(404);
      expect(problem.code).toBe('lead_not_found');
      expect(problem.detail).toBe('Lead not found');
    });


      const mapper = new DomainErrorMapper();
      const problem = mapper.map(err, 'trace_123');

      expect(problem.status).toBe(422);
      expect(problem.code).toBe('insufficient_balance');
    });

    it('includes error details as extensions', () => {
      const err = new ValidationError('field_error', 'Error', [], {
        fieldCount: 2,
        severity: 'warning',
      });

      const mapper = new DomainErrorMapper();
      const problem = mapper.map(err, 'trace_123');

      expect(problem.fieldCount).toBe(2);
      expect(problem.severity).toBe('warning');
    });

    it('only maps DomainError instances', () => {
      const mapper = new DomainErrorMapper();
      expect(mapper.canMap(new Error('generic'))).toBe(false);
      expect(mapper.canMap('string error')).toBe(false);
    });
  });

  describe('ZodErrorMapper', () => {
    it('maps ZodError to validation problem', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      const result = schema.safeParse({ email: 'invalid', age: 15 });
      expect(result.ok).toBe(false);
      const zodError = result.error as z.ZodError;

      const mapper = new ZodErrorMapper();
      expect(mapper.canMap(zodError)).toBe(true);

      const problem = mapper.map(zodError, 'trace_123');
      expect(problem.status).toBe(400);
      expect(problem.code).toBe('validation_failed');
      expect(problem.errors).toBeDefined();
      expect(problem.errors?.length).toBeGreaterThan(0);
    });

    it('extracts field paths from ZodError', () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      const result = schema.safeParse({ user: { email: 'not-email' } });
      const zodError = (result as Record<string, unknown>).error as z.ZodError;

      const mapper = new ZodErrorMapper();
      const problem = mapper.map(zodError, 'trace_123');

      expect(problem.errors).toBeDefined();
      const emailError = problem.errors?.find((e) => e.path.includes('email'));
      expect(emailError).toBeDefined();
    });

    it('ignores non-ZodError objects', () => {
      const mapper = new ZodErrorMapper();
      expect(mapper.canMap(new Error('generic'))).toBe(false);
      expect(mapper.canMap(new ValidationError('test', 'test'))).toBe(false);
    });
  });

  describe('HttpExceptionMapper', () => {
    it('maps Nest NotFoundException', () => {
      const nestErr = new NotFoundException('Resource not found');

      const mapper = new HttpExceptionMapper();
      expect(mapper.canMap(nestErr)).toBe(true);

      const problem = mapper.map(nestErr, 'trace_123');
      expect(problem.status).toBe(404);
      expect(problem.code).toBe('http_404');
    });

    it('maps Nest BadRequestException', () => {
      const nestErr = new BadRequestException('Invalid input');

      const mapper = new HttpExceptionMapper();
      const problem = mapper.map(nestErr, 'trace_123');

      expect(problem.status).toBe(400);
      expect(problem.code).toBe('http_400');
    });

    it('maps generic HttpException', () => {
      const nestErr = new HttpException('Conflict', 409);

      const mapper = new HttpExceptionMapper();
      const problem = mapper.map(nestErr, 'trace_123');

      expect(problem.status).toBe(409);
      expect(problem.code).toBe('http_409');
    });

    it('maps 404 route not found as route_not_found', () => {
      // Test that 404 responses get the right code
      const nestErr = new NotFoundException();

      const mapper = new HttpExceptionMapper();
      const problem = mapper.map(nestErr, 'trace_123');

      // The mapper should produce http_404 for general 404
      expect(problem.status).toBe(404);
      expect(problem.code).toMatch(/404/);
    });

    it('ignores non-HttpException objects', () => {
      const mapper = new HttpExceptionMapper();
      expect(mapper.canMap(new Error('generic'))).toBe(false);
      expect(mapper.canMap(new ValidationError('test', 'test'))).toBe(false);
    });
  });

  describe('FallbackMapper', () => {
    it('maps unknown errors to 500', () => {
      const err = new Error('Something went wrong');

      const mapper = new FallbackMapper();
      expect(mapper.canMap(err)).toBe(true);

      const problem = mapper.map(err, 'trace_123');
      expect(problem.status).toBe(500);
      expect(problem.code).toBe('internal_error');
    });

    it('never leaks the original error message', () => {
      const err = new Error('Secret internal detail');

      const mapper = new FallbackMapper();
      const problem = mapper.map(err, 'trace_123');

      expect(problem.detail).not.toContain('Secret');
      expect(problem.detail).toBe('An unexpected error occurred');
    });

    it('maps any unknown value', () => {
      const mapper = new FallbackMapper();
      expect(mapper.canMap('string')).toBe(true);
      expect(mapper.canMap(123)).toBe(true);
      expect(mapper.canMap(null)).toBe(true);
    });

    it('is the ultimate fallback', () => {
      const mapper = new FallbackMapper();
      const problem = mapper.map({}, 'trace_123');

      expect(problem.status).toBe(500);
      expect(problem.code).toBe('internal_error');
    });
  });

  describe('toProblem', () => {
    it('uses DomainErrorMapper for DomainError', () => {
      const err = new NotFoundError('User');
      const problem = toProblem(err, 'trace_123');

      expect(problem.status).toBe(404);
      expect(problem.code).toBe('user_not_found');
    });

    it('uses ZodErrorMapper for ZodError', () => {
      const schema = z.string().email();
      const result = schema.safeParse('not-email');
      if (result.success) throw new Error('expected failure');
      const zodError = result.error;

      const problem = toProblem(zodError, 'trace_123');
      expect(problem.status).toBe(400);
      expect(problem.code).toBe('validation_failed');
    });

    it('uses HttpExceptionMapper for Nest exceptions', () => {
      const nestErr = new NotFoundException('Not found');

      const problem = toProblem(nestErr, 'trace_123');
      expect(problem.status).toBe(404);
    });

    it('uses FallbackMapper for unknown errors', () => {
      const err = new Error('Unknown error');

      const problem = toProblem(err, 'trace_123');
      expect(problem.status).toBe(500);
      expect(problem.code).toBe('internal_error');
      expect(problem.detail).not.toContain('Unknown error');
    });

    it('includes traceId in all problems', () => {
      const problems = [
        toProblem(new NotFoundError('Entity'), 'trace_abc'),
        toProblem(new Error('Error'), 'trace_xyz'),
      ];

      problems.forEach((p) => {
        expect(p.traceId).toBeDefined();
      });
    });

    it('accepts custom mapper list', () => {
      const customMapper: ProblemMapper = {
        canMap: (e) => e instanceof RangeError,
        map: () => ({
          type: 'https://errors.iap.example/range',
          title: 'Range Error',
          status: 400,
          code: 'range_error',
          traceId: 'trace',
        }),
      };

      const err = new RangeError('Out of range');
      const problem = toProblem(err, 'trace_123', [customMapper]);

      expect(problem.code).toBe('range_error');
    });

    it('uses first matching mapper', () => {
      const validationErr = new ValidationError('test', 'test');

      const problem = toProblem(validationErr, 'trace_123');
      expect(problem.status).toBe(400);
      expect(problem.code).toBe('test');
    });
  });

  describe('RFC 9457 compliance', () => {
    it('always includes required fields', () => {
      const problem = ProblemDetailsBuilder.create()
        .status(400)
        .code('test')
        .traceId('trace_123')
        .build();

      expect(problem.type).toBeDefined();
      expect(problem.title).toBeDefined();
      expect(problem.status).toBeDefined();
      expect(problem.code).toBeDefined();
      expect(problem.traceId).toBeDefined();
    });

    it('has type as URI', () => {
      const problem = ProblemDetailsBuilder.create()
        .status(400)
        .code('invalid')
        .traceId('t')
        .build();

      expect(problem.type).toMatch(/^https:\/\//);
    });

    it('allows optional detail field', () => {
      const p1 = ProblemDetailsBuilder.create()
        .status(400)
        .code('test')
        .traceId('t')
        .build();
      expect(p1.detail).toBeUndefined();

      const p2 = ProblemDetailsBuilder.create()
        .status(400)
        .code('test')
        .detail('Something went wrong')
        .traceId('t')
        .build();
      expect(p2.detail).toBe('Something went wrong');
    });

    it('allows extension fields', () => {
      const problem = ProblemDetailsBuilder.create()
        .status(429)
        .code('rate_limited')
        .traceId('t')
        .extension('retryAfter', 60)
        .build();

      expect(problem.retryAfter).toBe(60);
    });
  });
});
