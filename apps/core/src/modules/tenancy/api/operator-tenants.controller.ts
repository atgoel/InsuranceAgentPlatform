import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { OperatorOnly } from '../../../kernel/tenancy/decorators';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { etagFor, parseIfMatch } from '../../../kernel/http/if-match';
import { ProvisionTenantService } from '../application/provision-tenant.service';
import { TenantQueryService } from '../application/tenant-query.service';
import { OperatorTenantService } from '../application/operator-tenant.service';
import { PlanCatalogue } from '../domain/plan';
import { Inject } from '@nestjs/common';
import { PLAN_CATALOGUE } from '../application/ports';
import { ChangePlanSchema, ListTenantsQuery, ProvisionTenantSchema, StatusTransitionSchema } from './schemas';

/** Platform operator console (W09, F44). Workforce realm + platform.operator only. */
@Controller('api/v1/ops')
@OperatorOnly()
export class OperatorTenantsController {
  constructor(
    private readonly provisioning: ProvisionTenantService,
    private readonly queries: TenantQueryService,
    private readonly operator: OperatorTenantService,
    @Inject(PLAN_CATALOGUE) private readonly plans: PlanCatalogue,
  ) {}

  @Post('tenants')
  @Idempotent()
  provision(@Body(new ZodValidationPipe(ProvisionTenantSchema)) body: z.infer<typeof ProvisionTenantSchema>) {
    return this.provisioning.provision(body);
  }

  @Get('tenants')
  list(@Query(new ZodValidationPipe(ListTenantsQuery)) query: z.infer<typeof ListTenantsQuery>) {
    return this.queries.listForOperator(query);
  }

  @Post('tenants/:id/provisioning-resumptions')
  @HttpCode(200)
  @Idempotent()
  resume(@Param('id') id: string) {
    return this.provisioning.resume(id);
  }

  @Post('tenants/:id/status-transitions')
  @HttpCode(200)
  @Idempotent()
  transition(@Param('id') id: string, @Body(new ZodValidationPipe(StatusTransitionSchema)) body: z.infer<typeof StatusTransitionSchema>) {
    return this.operator.transition(id, body.to, body.reason);
  }

  @Patch('tenants/:id')
  async changePlan(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(ChangePlanSchema)) body: z.infer<typeof ChangePlanSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const summary = await this.operator.changePlan(id, body.planCode, parseIfMatch(ifMatch));
    res.setHeader('ETag', etagFor(summary.version));
    return summary;
  }

  @Get('plans')
  listPlans() {
    return { items: this.plans.list().map((p) => ({ ...p, capabilities: [...p.capabilities].sort() })) };
  }
}
