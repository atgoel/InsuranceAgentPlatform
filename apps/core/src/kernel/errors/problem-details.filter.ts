import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from './domain-errors';
import { RequestContext } from '../observability/request-context';

interface ErrorBody {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  traceId: string;
  [key: string]: unknown;
  errors?: unknown;
}

/**
 * AC-M00-06 (errors): ProblemDetailsFilter
 * Global exception filter that maps errors to RFC 9457 Problem Details responses.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const context = RequestContext.current();
    const traceId = context?.traceId ?? 'unknown';

    let status = 500;
    const body: ErrorBody = {
      type: 'https://errors.iap.example/internal_error',
      title: 'Internal Server Error',
      status: 500,
      code: 'internal_error',
      detail: 'An unexpected error occurred',
      traceId,
    };

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      body.type = `https://errors.iap.example/${exception.code}`;
      body.title = 'Error';
      body.status = status;
      body.code = exception.code;
      body.detail = exception.message;
      body.traceId = traceId;
      Object.assign(body, exception.details);

      if (typeof exception === 'object' && exception !== null && 'errors' in exception) {
        body.errors = (exception as { errors?: unknown }).errors;
      }
    }

    response.status(status).json(body);
  }
}
