import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '../errors/domain-errors';
import { REQUIRED_PERMISSIONS_KEY } from './decorators';
import { PERMISSION_POLICY } from '../tokens';
import { PermissionPolicy, hasPermission } from './permissions';
import { Principal } from './jwt';

/**
 * AC-M00-19 (tenancy): PermissionGuard
 * Global guard that checks @RequirePermission decorators.
 * All required permissions must be granted by the PermissionPolicy.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PERMISSION_POLICY) private readonly permissionPolicy: PermissionPolicy,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest() as Record<string, unknown>;
    const principal: Principal | undefined = request.principal as Principal | undefined;

    if (!principal) {
      return true; // Let auth guard handle it
    }

    const grantedPermissions = this.permissionPolicy.permissionsFor(principal.roles);

    // All required permissions must be granted
    for (const permission of requiredPermissions) {
      if (!hasPermission(grantedPermissions, permission)) {
        throw new ForbiddenError('permission_denied', 'Permission denied', {
          required: requiredPermissions,
        });
      }
    }

    return true;
  }
}
