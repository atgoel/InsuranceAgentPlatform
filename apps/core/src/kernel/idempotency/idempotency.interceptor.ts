import { applyDecorators, CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, SetMetadata, UseInterceptors } from '@nestjs/common';
import { Request, Response } from 'express';
import { from, Observable, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { ConflictError, ValidationError } from '../errors/domain-errors';
import { canonicalJson, sha256Hex } from '../domain/canonical-json';
import { IDEMPOTENCY_STORE } from '../tokens';
import { Principal } from '../tenancy/principal';
import { routeTemplate } from '../observability/route-template.interceptor';
import { IdempotencyStore } from './idempotency-store';

export const IDEMPOTENT_KEY = 'iap:idempotent';
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/** Marks a POST handler as idempotent (M00 §9): requires Idempotency-Key and replays stored responses. */
export const Idempotent = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(IDEMPOTENT_KEY, true), UseInterceptors(IdempotencyInterceptor));

export function requestHash(method: string, route: string, body: unknown): string {
  return sha256Hex(`${method.toUpperCase()} ${route} ${canonicalJson(body ?? null)}`);
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.get('Idempotency-Key');
    if (!key || !KEY_PATTERN.test(key)) {
      throw new ValidationError('idempotency_key_required', 'A valid Idempotency-Key header (8–128 chars [A-Za-z0-9_-]) is required');
    }
    const tenantId = req.principal?.tenantId ?? 'public';
    const hash = requestHash(req.method, routeTemplate(context), req.body);
    return from(this.store.begin(tenantId, key, hash)).pipe(
      mergeMap((begin) => {
        if (begin.state === 'replay') {
          res.status(begin.status).setHeader('idempotent-replay', 'true');
          return of(begin.body);
        }
        if (begin.state === 'conflict') throw new ConflictError('idempotency_key_reuse', 'Idempotency-Key was already used with a different request');
        if (begin.state === 'in_progress') throw new ConflictError('idempotency_in_progress', 'A request with this Idempotency-Key is still in progress');
        return this.runAndStore(next, res, tenantId, key);
      }),
    );
  }

  private runAndStore(next: CallHandler, res: Response, tenantId: string, key: string): Observable<unknown> {
    return next.handle().pipe(
      mergeMap((body) => from(this.store.complete(tenantId, key, res.statusCode, body)).pipe(mergeMap(() => of(body)))),
      catchError((error: unknown) => from(this.store.release(tenantId, key)).pipe(mergeMap(() => { throw error; }))),
    );
  }
}
