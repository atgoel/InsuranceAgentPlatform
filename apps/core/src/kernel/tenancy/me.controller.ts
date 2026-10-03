import { Controller, Get, Inject } from '@nestjs/common';
import { CurrentPrincipal } from './decorators';
import { Principal } from './principal';
import { TENANT_PERMISSION_POLICY } from '../tokens';
import { TenantPermissionPolicy } from './permissions';

/**
 * AC-M00-18 (tenancy): GET /api/v1/me
 * Returns the current user principal with permissions.
 */
@Controller('api/v1')
export class MeController {
  constructor(@Inject(TENANT_PERMISSION_POLICY) private readonly permissionPolicy: TenantPermissionPolicy) {}

  @Get('me')
  async getMe(@CurrentPrincipal() principal: Principal) {
    const permissions = Array.from(await this.permissionPolicy.permissionsFor(principal.roles, principal.tenantId)).sort();
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
