import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Principal } from './principal';

/**
 * AC-M00-18, 19 (tenancy): Decorators
 * Guards and parameter decorators for authentication and authorization.
 */

export const IS_PUBLIC_KEY = 'isPublic';
export const IS_OPERATOR_ONLY_KEY = 'isOperatorOnly';
export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * @Public() - Skip AuthGuard for this endpoint
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true) as MethodDecorator & ClassDecorator;

/**
 * @OperatorOnly() - Require workforce realm and platform.operator role
 */
export const OperatorOnly = () => SetMetadata(IS_OPERATOR_ONLY_KEY, true) as MethodDecorator & ClassDecorator;

/**
 * @RequirePermission('perm1', 'perm2') - Require at least one permission (all must be granted)
 */
export const RequirePermission = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions) as MethodDecorator & ClassDecorator;

/**
 * @CurrentPrincipal() - Inject the Principal from the request context
 */
export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.principal as Principal;
});
