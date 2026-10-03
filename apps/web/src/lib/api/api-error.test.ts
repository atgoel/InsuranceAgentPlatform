import { describe, it, expect } from 'vitest';
import { ApiError } from './api-error';

describe('AC-M00-27 ApiError', () => {
  it('creates error from problem details response', () => {
    const error = ApiError.fromProblem(400, {
      code: 'validation_failed',
      title: 'Validation failed',
      detail: 'Invalid input',
      traceId: 'trace123',
      status: 400,
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('validation_failed');
    expect(error.traceId).toBe('trace123');
  });

  it('creates network error', () => {
    const cause = new Error('Network failed');
    const error = ApiError.network(cause);
    expect(error.status).toBe(0);
    expect(error.code).toBe('network_error');
  });

  it('stores field errors', () => {
    const error = new ApiError(400, 'validation_failed', 'Validation failed', 'Invalid');
    error.errors = [{ path: 'email', code: 'invalid_email', message: 'Invalid email' }];
    expect(error.errors).toHaveLength(1);
    expect(error.errors[0].path).toBe('email');
  });
});

describe('AC-M06-12 ApiError field errors and details', () => {
  it('AC-M06-12 keeps field errors and details from the problem body', () => {
    const errors = [{ path: 'input.x', code: 'min', message: 'Too low' }];
    const error = ApiError.fromProblem(422, { code: 'advice_incomplete', title: 'Incomplete', errors, details: { missing: ['recommendation'] } });
    expect(error.errors).toEqual(errors);
    expect(error.details).toEqual({ missing: ['recommendation'] });
  });

  it('AC-M06-14 collects top-level problem extensions (as the API sends them) into details', () => {
    const error = ApiError.fromProblem(422, { type: 'about:blank', title: 'Incomplete', status: 422, code: 'advice_incomplete', traceId: 't1', missing: ['customerChoice'] });
    expect(error.details).toEqual({ missing: ['customerChoice'] });
    expect(ApiError.fromProblem(404, { code: 'x', title: 'Not found' }).details).toBeUndefined();
  });
});
