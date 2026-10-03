import { z, ZodError } from 'zod';
import { HttpException } from '@nestjs/common';
import { DomainError, ValidationError, FieldError } from './domain-errors';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  traceId: string;
  errors?: FieldError[];
  [ext: string]: unknown;
}

const HTTP_STATUS_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  412: 'Precondition Failed',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export class ProblemDetailsBuilder {
  private statusValue: number = 500;
  private codeValue: string = '';
  private titleValue: string = '';
  private detailValue?: string;
  private traceIdValue: string = '';
  private errorsValue?: FieldError[];
  private extensionsValue: Record<string, unknown> = {};

  static create(): ProblemDetailsBuilder {
    return new ProblemDetailsBuilder();
  }

  status(s: number): this {
    this.statusValue = s;
    return this;
  }

  code(c: string): this {
    this.codeValue = c;
    return this;
  }

  title(t: string): this {
    this.titleValue = t;
    return this;
  }

  detail(d?: string): this {
    this.detailValue = d;
    return this;
  }

  traceId(id: string): this {
    this.traceIdValue = id;
    return this;
  }

  errors(e?: FieldError[]): this {
    this.errorsValue = e;
    return this;
  }

  extension(k: string, v: unknown): this {
    this.extensionsValue[k] = v;
    return this;
  }

  build(): ProblemDetails {
    const result: ProblemDetails = {
      type: `https://errors.iap.example/${this.codeValue}`,
      title: this.titleValue || HTTP_STATUS_PHRASES[this.statusValue] || 'Unknown Error',
      status: this.statusValue,
      code: this.codeValue,
      traceId: this.traceIdValue,
    };

    if (this.detailValue !== undefined) {
      result.detail = this.detailValue;
    }

    if (this.errorsValue !== undefined) {
      result.errors = this.errorsValue;
    }

    Object.assign(result, this.extensionsValue);

    return result;
  }
}

export interface ProblemMapper {
  canMap(error: unknown): boolean;
  map(error: unknown, traceId: string): ProblemDetails;
}

export class DomainErrorMapper implements ProblemMapper {
  canMap(error: unknown): boolean {
    return error instanceof DomainError;
  }

  map(error: unknown, traceId: string): ProblemDetails {
    const err = error as DomainError;
    const builder = ProblemDetailsBuilder.create()
      .status(err.httpStatus)
      .code(err.code)
      .detail(err.message)
      .traceId(traceId);

    if (error instanceof ValidationError && error.errors.length > 0) {
      builder.errors(error.errors);
    }

    if (err.details) {
      Object.entries(err.details).forEach(([key, value]) => {
        builder.extension(key, value);
      });
    }

    return builder.build();
  }
}

export class ZodErrorMapper implements ProblemMapper {
  canMap(error: unknown): boolean {
    return error instanceof ZodError;
  }

  map(error: unknown, traceId: string): ProblemDetails {
    const zodError = error as ZodError;
    const fieldErrors: FieldError[] = zodError.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    }));

    return ProblemDetailsBuilder.create()
      .status(400)
      .code('validation_failed')
      .detail('Request validation failed')
      .traceId(traceId)
      .errors(fieldErrors)
      .build();
  }
}

export class HttpExceptionMapper implements ProblemMapper {
  canMap(error: unknown): boolean {
    return error instanceof HttpException;
  }

  map(error: unknown, traceId: string): ProblemDetails {
    const httpError = error as HttpException;
    const status = httpError.getStatus();
    const code = `http_${status}`;

    return ProblemDetailsBuilder.create()
      .status(status)
      .code(code)
      .detail(httpError.message)
      .traceId(traceId)
      .build();
  }
}

export class FallbackMapper implements ProblemMapper {
  canMap(error: unknown): boolean {
    return true;
  }

  map(error: unknown, traceId: string): ProblemDetails {
    return ProblemDetailsBuilder.create()
      .status(500)
      .code('internal_error')
      .detail('An unexpected error occurred')
      .traceId(traceId)
      .build();
  }
}

export function toProblem(
  error: unknown,
  traceId: string,
  mappers?: ProblemMapper[]
): ProblemDetails {
  const defaultMappers: ProblemMapper[] = [
    new DomainErrorMapper(),
    new ZodErrorMapper(),
    new HttpExceptionMapper(),
    new FallbackMapper(),
  ];

  const allMappers = mappers ? [...mappers, ...defaultMappers] : defaultMappers;

  for (const mapper of allMappers) {
    if (mapper.canMap(error)) {
      return mapper.map(error, traceId);
    }
  }

  // Should never reach here due to FallbackMapper
  return new FallbackMapper().map(error, traceId);
}
