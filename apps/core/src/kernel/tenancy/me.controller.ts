import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentPrincipal } from './decorators';
import { Principal } from './principal';
import { PERMISSION_POLICY } from '../tokens';
import { PermissionPolicy } from './permissions';

/**
 * AC-M00-18 (tenancy): GET /api/v1/me
 * Returns the current user principal with permissions.
 */
@Controller('api/v1')
export class MeController {
  constructor(@Inject(PERMISSION_POLICY) private readonly permissionPolicy: PermissionPolicy) {}

  @Get('me')
  getMe(@CurrentPrincipal() principal: Principal) {
    const permissions = Array.from(this.permissionPolicy.permissionsFor(principal.roles)).sort();
    return {
      userRef: principal.userRef,
      tenantId: principal.tenantId,
      memberId: principal.memberId,
      orgUnitId: principal.orgUnitId,
      roles: principal.roles,
      permissions,
    };
  }
}
