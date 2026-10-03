import { ExceptionFilter, Catch, ArgumentsHost, Inject } from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from './domain-errors';
import { LOGGER } from '../tokens';
import { RequestContext } from '../observability/request-context';

/**
 * AC-M00-06 (errors): ProblemDetailsFilter
 * Global exception filter that maps errors to RFC 9457 Problem Details responses.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: any) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const context = RequestContext.current();
    const traceId = context?.traceId ?? 'unknown';

    let status = 500;
    let body: any = {
      type: 'https://errors.iap.example/internal_error',
      title: 'Internal Server Error',
      status: 500,
      code: 'internal_error',
      detail: 'An unexpected error occurred',
      traceId,
    };

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      body = {
        type: `https://errors.iap.example/${exception.code}`,
        title: 'Error',
        status,
        code: exception.code,
        detail: exception.message,
        traceId,
        ...exception.details,
      };

      if ((exception as any).errors) {
        body.errors = (exception as any).errors;
      }
    }

    response.status(status).json(body);
  }
}
