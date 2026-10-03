import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject, BadRequestException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';
import { ConflictError } from '../errors/domain-errors';
import { IDEMPOTENCY_STORE, LOGGER } from '../tokens';
import { IdempotencyStore } from './idempotency-store';
import { createHash } from 'crypto';

export const Idempotent = (): MethodDecorator => {
  return (target, propertyKey, descriptor) => {
    Reflect.metadata('idempotent', true, target, propertyKey);
    return descriptor;
  };
};

export function requestHash(method: string, route: string, body: unknown): string {
  const message = method + route + JSON.stringify(body, Object.keys(body as any).sort());
  return createHash('sha256').update(message).digest('hex');
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
    @Inject(LOGGER) private readonly logger: any,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request: any = context.switchToHttp().getRequest();
    const response: Response = context.switchToHttp().getResponse();

    const isIdempotent = Reflect.getMetadata('idempotent', context.getHandler());
    if (!isIdempotent) {
      return next.handle();
    }

    const idempotencyKey = request.get('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException({
        code: 'idempotency_key_required',
        message: 'Valid Idempotency-Key header required',
      });
    }

    const tenantId = request.principal?.tenantId ?? 'public';
    const hash = requestHash(request.method, request.baseUrl + request.route.path, request.body);

    const result = await this.store.begin(tenantId, idempotencyKey, hash);

    if (result.state === 'replay') {
      response.setHeader('idempotent-replay', 'true');
      return { ok: true, value: result.body };
    }

    if (result.state === 'conflict') {
      throw new ConflictError('idempotency_key_reuse', 'Idempotency key already used with different request');
    }

    if (result.state === 'in_progress') {
      throw new ConflictError('idempotency_in_progress', 'Request with this key is already in progress');
    }

    return next.handle().pipe(
      tap(
        async (data: any) => {
          const status = response.statusCode || 200;
          await this.store.complete(tenantId, idempotencyKey, status, data);
        },
        async (error: any) => {
          await this.store.release(tenantId, idempotencyKey);
        },
      ),
    );
  }
}
