import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Observable } from 'rxjs';
import { RequestContext } from './request-context';

/**
 * Records the matched route template in the request context so metrics and canonical log lines
 * use `/api/v1/leads/:id` (bounded cardinality) instead of raw URLs.
 */
@Injectable()
export class RouteTemplateInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') RequestContext.patch({ route: routeTemplate(context) });
    return next.handle();
  }
}

export function routeTemplate(context: ExecutionContext): string {
  const base = (Reflect.getMetadata(PATH_METADATA, context.getClass()) as string | undefined) ?? '';
  const path = (Reflect.getMetadata(PATH_METADATA, context.getHandler()) as string | undefined) ?? '';
  const joined = `/${base}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}
