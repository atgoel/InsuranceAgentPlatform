import { INestApplication } from '@nestjs/common';
import { NextFunction, raw, Request, Response } from 'express';
import { ProblemDetailsBuilder } from '../../../kernel/errors/problem-details';
import { RequestContext } from '../../../kernel/observability/request-context';
import { newTraceId } from '../../../kernel/observability/trace-context';
import { integrationPolicy } from '../domain/integration-policy';

function retainRawBody(request: Request, _response: Response, body: Buffer): void {
  Object.assign(request, { rawBody: body });
}

function rejectOversize(error: unknown, _request: Request, response: Response, next: NextFunction): void {
  if (!(error instanceof Error) || !('type' in error) || error.type !== 'entity.too.large') {
    next(error);
    return;
  }
  const problem = ProblemDetailsBuilder.create().status(413).code('callback_too_large')
    .title('Payload Too Large').detail('Callback exceeds size limit')
    .traceId(RequestContext.current()?.traceId ?? newTraceId()).build();
  response.status(413).type('application/problem+json').json(problem);
}

/** Installed before Nest's JSON parser so signatures and schema errors use the original bytes. */
export function installCallbackBodyParser(app: INestApplication): void {
  app.use('/api/v1/callbacks', raw({ type: () => true, limit: integrationPolicy.callbackMaxBytes, verify: retainRawBody }), rejectOversize);
}
