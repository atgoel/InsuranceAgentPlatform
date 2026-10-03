import {
  DomainError,
  ValidationError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  PreconditionFailedError,
  BusinessRuleError,
  RateLimitedError,
  DependencyUnavailableError,
  UnknownOutcomeError,
  FieldError,
} from './domain-errors';

describe('AC-M00-06 DomainError hierarchy', () => {
  describe('ValidationError', () => {
    it('has 400 status', () => {
      const err = new ValidationError('invalid_input', 'Input is invalid');
      expect(err.httpStatus).toBe(400);
    });

    it('stores code and message', () => {
      const err = new ValidationError('invalid_email', 'Email format is invalid');
      expect(err.code).toBe('invalid_email');
      expect(err.message).toBe('Email format is invalid');
    });

    it('stores field errors', () => {
      const fieldErrors: FieldError[] = [
        { path: 'email', code: 'invalid_email', message: 'Must be valid email' },
        { path: 'name', code: 'required', message: 'Name is required' },
      ];
      const err = new ValidationError('validation_failed', 'Form has errors', fieldErrors);
      expect(err.errors).toEqual(fieldErrors);
    });

    it('defaults errors to empty array', () => {
      const err = new ValidationError('invalid', 'Invalid');
      expect(err.errors).toEqual([]);
    });
  });

  describe('UnauthenticatedError', () => {
    it('has 401 status', () => {
      const err = new UnauthenticatedError();
      expect(err.httpStatus).toBe(401);
    });

    it('has default code and message', () => {
      const err = new UnauthenticatedError();
      expect(err.code).toBe('unauthenticated');
      expect(err.message).toBe('Authentication required');
    });

    it('allows custom code and message', () => {
      const err = new UnauthenticatedError('invalid_token', 'Token is expired');
      expect(err.code).toBe('invalid_token');
      expect(err.message).toBe('Token is expired');
    });
  });

  describe('ForbiddenError', () => {
    it('has 403 status', () => {
      const err = new ForbiddenError();
      expect(err.httpStatus).toBe(403);
    });

    it('has default code and message', () => {
      const err = new ForbiddenError();
      expect(err.code).toBe('forbidden');
      expect(err.message).toBe('Not allowed');
    });

    it('allows custom code and message', () => {
      const err = new ForbiddenError('tenant_mismatch', 'Tenant does not match');
      expect(err.code).toBe('tenant_mismatch');
      expect(err.message).toBe('Tenant does not match');
    });
  });

  describe('NotFoundError', () => {
    it('has 404 status', () => {
      const err = new NotFoundError('Lead');
      expect(err.httpStatus).toBe(404);
    });

    it('generates code from entity name', () => {
      const err = new NotFoundError('Lead');
      expect(err.code).toBe('lead_not_found');
    });

    it('generates message from entity name', () => {
      const err = new NotFoundError('Lead');
      expect(err.message).toBe('Lead not found');
    });

    it('accepts optional ID for details', () => {
      const err = new NotFoundError('User', 'usr_123');
      expect(err.code).toBe('user_not_found');
      expect(err.message).toBe('User not found');
    });

    it('handles multi-word entity names', () => {
      const err = new NotFoundError('AuditEvent');
      expect(err.code).toBe('audit_event_not_found');
    });
  });

  describe('ConflictError', () => {
    it('has 409 status', () => {
      const err = new ConflictError('duplicate_key', 'Key already exists');
      expect(err.httpStatus).toBe(409);
    });

    it('stores code and message', () => {
      const err = new ConflictError('duplicate_email', 'Email is already registered');
      expect(err.code).toBe('duplicate_email');
      expect(err.message).toBe('Email is already registered');
    });
  });

  describe('PreconditionFailedError', () => {
    it('has 412 status', () => {
      const err = new PreconditionFailedError();
      expect(err.httpStatus).toBe(412);
    });

    it('has version_mismatch code', () => {
      const err = new PreconditionFailedError();
      expect(err.code).toBe('version_mismatch');
    });

    it('has default message', () => {
      const err = new PreconditionFailedError();
      expect(err.message).toBe('Version mismatch');
    });
  });

  describe('BusinessRuleError', () => {
    it('has 422 status', () => {
      const err = new BusinessRuleError('lead_already_assigned', 'Lead is already assigned');
      expect(err.httpStatus).toBe(422);
    });

    it('stores code and message', () => {
      const err = new BusinessRuleError('insufficient_funds', 'Account balance is insufficient');
      expect(err.code).toBe('insufficient_funds');
      expect(err.message).toBe('Account balance is insufficient');
    });
  });

  describe('RateLimitedError', () => {
    it('has 429 status', () => {
      const err = new RateLimitedError('rate_limit_exceeded', 'Too many requests', {
        retryAfterSeconds: 60,
      });
      expect(err.httpStatus).toBe(429);
    });

    it('stores retryAfterSeconds in details', () => {
      const err = new RateLimitedError('rate_limit', 'Please retry later', {
        retryAfterSeconds: 30,
      });
      expect(err.details?.retryAfterSeconds).toBe(30);
    });
  });

  describe('DependencyUnavailableError', () => {
    it('has 503 status', () => {
      const err = new DependencyUnavailableError('database');
      expect(err.httpStatus).toBe(503);
    });

    it('has dependency_unavailable code', () => {
      const err = new DependencyUnavailableError('crm-api');
      expect(err.code).toBe('dependency_unavailable');
    });

    it('stores dependency name in details', () => {
      const err = new DependencyUnavailableError('payment-gateway');
      expect(err.details?.dependency).toBe('payment-gateway');
    });

    it('has descriptive message', () => {
      const err = new DependencyUnavailableError('postgres');
      expect(err.message).toContain('postgres');
    });
  });

  describe('UnknownOutcomeError', () => {
    it('has 202 status', () => {
      const err = new UnknownOutcomeError('charge_ref_123');
      expect(err.httpStatus).toBe(202);
    });

    it('has outcome_unknown code', () => {
      const err = new UnknownOutcomeError('payment_123');
      expect(err.code).toBe('outcome_unknown');
    });

    it('stores operationRef for reconciliation', () => {
      const err = new UnknownOutcomeError('txn_abc123');
      expect(err.details?.operationRef).toBe('txn_abc123');
    });
  });

  describe('error hierarchy', () => {
    it('extends Error', () => {
      const err = new ValidationError('test', 'test error');
      expect(err).toBeInstanceOf(Error);
    });

    it('can be caught as Error', () => {
      const err = new NotFoundError('Entity');
      expect(() => {
        throw err;
      }).toThrow(Error);
    });

    it('all errors are DomainError instances', () => {
      const errors: DomainError[] = [
        new ValidationError('test', 'test'),
        new UnauthenticatedError(),
        new ForbiddenError(),
        new NotFoundError('Entity'),
        new ConflictError('code', 'msg'),
        new BusinessRuleError('code', 'msg'),
        new RateLimitedError('code', 'msg'),
        new DependencyUnavailableError('dep'),
        new UnknownOutcomeError('ref'),
      ];

      errors.forEach((err) => {
        expect(err).toBeInstanceOf(DomainError);
        expect(err.httpStatus).toBeGreaterThan(0);
        expect(err.code).toBeDefined();
        expect(err.message).toBeDefined();
      });
    });
  });

  describe('details and safe messages', () => {
    it('stores safe details without PII', () => {
      const err = new BusinessRuleError('form_incomplete', 'Form has errors', {
        formFields: ['email', 'name'],
      });
      expect(err.details?.formFields).toEqual(['email', 'name']);
    });

    it('provides safe detail for Problem Details', () => {
      const err = new NotFoundError('Lead');
      expect(err.message).toBe('Lead not found');
    });
  });
});
