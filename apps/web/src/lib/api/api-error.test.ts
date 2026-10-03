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
