import { Body, Controller, Get, Headers, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { etagFor, parseIfMatch } from '../../../kernel/http/if-match';
import { RoleService } from '../application/role.service';
import { RoleDefinition } from '../domain/roles';
import { RolePermissionsSchema } from './schemas';

const view = (d: RoleDefinition) => ({ ...d, etag: etagFor(d.version) });

/** Roles & permissions editor (W10). Edits are versioned (If-Match) and audited. */
@Controller('api/v1/roles')
export class RolesController {
  constructor(private readonly roles: RoleService) {}

  @Get()
  @RequirePermission('distribution.role.read')
  async list(@CurrentPrincipal() p: Principal) {
    return { items: (await this.roles.list(p.tenantId)).map(view) };
  }

  @Get(':role/preview')
  @RequirePermission('distribution.role.read')
  preview(@CurrentPrincipal() p: Principal, @Param('role') role: string) {
    return this.roles.preview(p.tenantId, role);
  }

  @Put(':role/permissions')
  @RequirePermission('distribution.role.write')
  async update(@CurrentPrincipal() p: Principal, @Param('role') role: string, @Headers('if-match') ifMatch: string | undefined, @Body(new ZodValidationPipe(RolePermissionsSchema)) body: z.infer<typeof RolePermissionsSchema>) {
    return view(await this.roles.updatePermissions(p.tenantId, role, body.permissions, parseIfMatch(ifMatch)));
  }
}
