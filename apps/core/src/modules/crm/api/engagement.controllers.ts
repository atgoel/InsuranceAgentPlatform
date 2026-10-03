import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { etagFor, parseIfMatch } from '../../../kernel/http/if-match';
import { OpportunityService } from '../application/opportunity.service';
import { TaskService } from '../application/task.service';
import { RoutingService } from '../application/routing.service';
import { MyWorkService } from '../application/my-work.service';
import { LeadImportService } from '../application/lead-import.service';
import {
  BoardQuery, CreateTaskSchema, LeadImportSchema, ListTasksQuery, LossSchema, OpportunityMoveSchema, PatchTaskSchema, ReplaceCustomFieldsSchema, RoutingRulesSchema, SimulationSchema,
} from './schemas';

/** Pipeline (CRM03). There is deliberately no way to set ISSUED over HTTP. */
@Controller('api/v1/opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunityService) {}

  @Get()
  @RequirePermission('crm.opportunity.read')
  board(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(BoardQuery)) q: z.infer<typeof BoardQuery>) {
    return this.opportunities.board(p, { ownerMemberId: q.owner === 'me' ? p.memberId : q.owner, productInterest: q.product });
  }

  @Get(':id')
  @RequirePermission('crm.opportunity.read')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const view = await this.opportunities.get(p, id);
    res.setHeader('ETag', etagFor(view.version));
    return view;
  }

  // eslint-disable-next-line max-params
  @Put(':id/custom-fields')
  @RequirePermission('crm.opportunity.write')
  async replaceCustomFields(
    @CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(ReplaceCustomFieldsSchema)) body: z.infer<typeof ReplaceCustomFieldsSchema>, @Res({ passthrough: true }) res: Response,
  ) {
    const view = await this.opportunities.replaceCustomFields(p, id, body.customFields, parseIfMatch(ifMatch));
    res.setHeader('ETag', etagFor(view.version));
    return view;
  }

  @Post(':id/stage-transitions')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('crm.opportunity.write')
  move(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(OpportunityMoveSchema)) body: z.infer<typeof OpportunityMoveSchema>) {
    return this.opportunities.move(p, id, body.to);
  }

  @Post(':id/loss')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('crm.opportunity.write')
  lose(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(LossSchema)) body: z.infer<typeof LossSchema>) {
    return this.opportunities.markLost(p, id, body.reason);
  }
}

/** Tasks (CRM05, M17). */
@Controller('api/v1/tasks')
export class TasksController {
  constructor(private readonly tasks: TaskService) {}

  @Get()
  @RequirePermission('crm.task.read')
  list(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(ListTasksQuery)) q: z.infer<typeof ListTasksQuery>) {
    return this.tasks.list(p, q);
  }

  @Post()
  @Idempotent()
  @RequirePermission('crm.task.write')
  create(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(CreateTaskSchema)) body: z.infer<typeof CreateTaskSchema>) {
    return this.tasks.create(p, body);
  }

  @Patch(':id')
  @RequirePermission('crm.task.write')
  update(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined, @Body(new ZodValidationPipe(PatchTaskSchema)) body: z.infer<typeof PatchTaskSchema>) {
    return this.tasks.update(p, id, body, parseIfMatch(ifMatch));
  }
}

/** Routing rules, "Test a lead" and capacity (CRM07). */
@Controller('api/v1')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Get('routing-rules')
  @RequirePermission('crm.routing.read')
  async rules(@CurrentPrincipal() p: Principal) {
    return { rules: await this.routing.rulesFor(p) };
  }

  @Put('routing-rules')
  @RequirePermission('crm.routing.write')
  async replace(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(RoutingRulesSchema)) body: z.infer<typeof RoutingRulesSchema>) {
    return { rules: await this.routing.replaceRules(p, body.rules) };
  }

  @Post('routing-rules/simulations')
  @HttpCode(200)
  @RequirePermission('crm.routing.read')
  simulate(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(SimulationSchema)) body: z.infer<typeof SimulationSchema>) {
    return this.routing.simulate(p, body);
  }

  @Get('routing/capacity')
  @RequirePermission('crm.routing.read')
  async capacity(@CurrentPrincipal() p: Principal) {
    return { items: await this.routing.capacity(p) };
  }
}

/** "Today" for the signed-in member (F79). */
@Controller('api/v1/my-work')
export class MyWorkController {
  constructor(private readonly myWork: MyWorkService) {}

  @Get()
  today(@CurrentPrincipal() p: Principal) {
    return this.myWork.today(p);
  }
}

/** Bulk lead import (CRM08). */
@Controller('api/v1/lead-imports')
export class LeadImportsController {
  constructor(private readonly imports: LeadImportService) {}

  @Post('previews')
  @HttpCode(200)
  @RequirePermission('crm.import')
  preview(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(LeadImportSchema)) body: z.infer<typeof LeadImportSchema>) {
    return this.imports.preview(p, body);
  }

  @Post()
  @Idempotent()
  @RequirePermission('crm.import')
  commit(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(LeadImportSchema)) body: z.infer<typeof LeadImportSchema>) {
    return this.imports.commit(p, body);
  }
}
