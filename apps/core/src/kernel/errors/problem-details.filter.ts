import { ArgumentsHost, Catch, ExceptionFilter, Inject } from '@nestjs/common';
import { Response } from 'express';
import { LOGGER } from '../tokens';
import { Logger } from '../observability/logger';
import { RequestContext } from '../observability/request-context';
import { newTraceId } from '../observability/trace-context';
import { DependencyUnavailableError, RateLimitedError } from './domain-errors';
import { ProblemDetails, toProblem } from './problem-details';

const DEFAULT_RETRY_AFTER_SECONDS = 30;

/**
 * Global RFC 9457 error boundary (M00 §3.3). Every error becomes Problem Details with the trace id.
 * 5xx: logged at error level (deduplicated) and the request context is marked so the debug buffer is flushed.
 * 4xx: debug only — buffered, written just when the request is otherwise interesting.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const ctx = RequestContext.current();
    const problem = toProblem(exception, ctx?.traceId ?? newTraceId());
    this.log(exception, problem);
    const retryAfter = retryAfterSeconds(exception);
    if (retryAfter !== undefined) response.setHeader('Retry-After', String(retryAfter));
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private log(exception: unknown, problem: ProblemDetails): void {
    if (problem.status >= 500) {
      RequestContext.patch({ hasError: true });
      this.logger.error('http.unhandled_error', 'Unhandled error', exception, { code: problem.code, status: problem.status });
    } else {
      this.logger.debug('http.client_error', 'Request rejected', { code: problem.code, status: problem.status });
    }
  }
}

function retryAfterSeconds(exception: unknown): number | undefined {
  if (!(exception instanceof RateLimitedError || exception instanceof DependencyUnavailableError)) return undefined;
  const value = exception.details?.retryAfterSeconds;
  return typeof value === 'number' && value > 0 ? value : DEFAULT_RETRY_AFTER_SECONDS;
}
