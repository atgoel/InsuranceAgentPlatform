export interface FieldError {
  path: string;
  code: string;
  message: string;
}

export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}

export class ValidationError extends DomainError {
  readonly httpStatus = 400;
  readonly errors: FieldError[];

  constructor(code: string, message: string, errors: FieldError[] = []) {
    super(code, message);
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class UnauthenticatedError extends DomainError {
  readonly httpStatus = 401;

  constructor(code = 'unauthenticated', message = 'Authentication required') {
    super(code, message);
    Object.setPrototypeOf(this, UnauthenticatedError.prototype);
  }
}

export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;

  constructor(code = 'forbidden', message = 'Not allowed', details?: Record<string, unknown>) {
    super(code, message, details);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class NotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(entity: string, id?: string) {
    const code = entity.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') + '_not_found';
    const message = `${entity.charAt(0).toUpperCase() + entity.slice(1)} not found`;
    const details = id ? { id } : undefined;
    super(code, message, details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends DomainError {
  readonly httpStatus = 409;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class PreconditionFailedError extends DomainError {
  readonly httpStatus = 412;

  constructor(code = 'version_mismatch', message = 'Version mismatch', details?: Record<string, unknown>) {
    super(code, message, details);
    Object.setPrototypeOf(this, PreconditionFailedError.prototype);
  }
}

export class BusinessRuleError extends DomainError {
  readonly httpStatus = 422;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    Object.setPrototypeOf(this, BusinessRuleError.prototype);
  }
}

export class RateLimitedError extends DomainError {
  readonly httpStatus = 429;

  constructor(code = 'rate_limited', message = 'Too many requests', details?: Record<string, unknown>) {
    super(code, message, details);
    Object.setPrototypeOf(this, RateLimitedError.prototype);
  }
}

export class DependencyUnavailableError extends DomainError {
  readonly httpStatus = 503;

  constructor(dependency: string) {
    super(
      'dependency_unavailable',
      `Dependency unavailable: ${dependency}`,
      { dependency }
    );
    Object.setPrototypeOf(this, DependencyUnavailableError.prototype);
  }
}

export class UnknownOutcomeError extends DomainError {
  readonly httpStatus = 202;

  constructor(operationRef: string) {
    super('outcome_unknown', 'Operation outcome unknown', { operationRef });
    Object.setPrototypeOf(this, UnknownOutcomeError.prototype);
  }
}
