import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { HouseholdService } from '../application/household.service';
import { householdView } from './views';
import { AddHouseholdMemberSchema, CreateHouseholdSchema } from './schemas';

/** Optional household linking (AC-M03-12). */
@Controller('api/v1/households')
export class HouseholdsController {
  constructor(private readonly households: HouseholdService) {}

  @Post()
  @Idempotent()
  @RequirePermission('party.write')
  async create(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(CreateHouseholdSchema)) body: z.infer<typeof CreateHouseholdSchema>) {
    return householdView(await this.households.create(p, body));
  }

  @Post(':id/members')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('party.write')
  async addMember(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(AddHouseholdMemberSchema)) body: z.infer<typeof AddHouseholdMemberSchema>) {
    return householdView(await this.households.addMember(p, id, body.partyId, body.relation));
  }

  @Delete(':id/members/:partyId')
  @HttpCode(204)
  @RequirePermission('party.write')
  async removeMember(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Param('partyId') partyId: string): Promise<void> {
    await this.households.removeMember(p, id, partyId);
  }
}
