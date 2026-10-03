import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { OrgUnitService } from '../application/org-unit.service';
import { CreateOrgUnitSchema, MoveOrgUnitSchema } from './schemas';

/** Branch/team hierarchy (W10 "Org structure"). */
@Controller('api/v1/org-units')
export class OrgUnitsController {
  constructor(private readonly units: OrgUnitService) {}

  @Get()
  @RequirePermission('distribution.member.read')
  tree(@CurrentPrincipal() p: Principal) {
    return this.units.tree(p.tenantId);
  }

  @Post()
  @Idempotent()
  @RequirePermission('distribution.org.write')
  create(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(CreateOrgUnitSchema)) body: z.infer<typeof CreateOrgUnitSchema>) {
    return this.units.create(p.tenantId, body);
  }

  @Post(':id/moves')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('distribution.org.write')
  move(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(MoveOrgUnitSchema)) body: z.infer<typeof MoveOrgUnitSchema>) {
    return this.units.move(p.tenantId, id, body.parentId);
  }
}
