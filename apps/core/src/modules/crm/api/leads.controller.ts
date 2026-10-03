import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { etagFor, parseIfMatch } from '../../../kernel/http/if-match';
import { LeadCaptureService } from '../application/lead-capture.service';
import { LeadService } from '../application/lead.service';
import { ActivityService } from '../application/activity.service';
import { ConversionService } from '../application/conversion.service';
import {
  ActivitySchema, AssignSchema, BulkAssignSchema, CaptureLeadSchema, ConversionSchema, ListLeadsQuery, PartyLinkSchema, QualificationSchema, ReplaceCustomFieldsSchema,
  StageTransitionSchema, TemperatureSchema,
} from './schemas';

/** Leads workspace and record (CRM01, CRM02, M02/M16). */
@Controller('api/v1/leads')
export class LeadsController {
  constructor(
    private readonly capture: LeadCaptureService,
    private readonly leads: LeadService,
    private readonly activities: ActivityService,
    private readonly conversion: ConversionService,
  ) {}

  /** 201 for a new lead, 200 when the enquiry was folded into an open lead (dedup). */
  @Post()
  @Idempotent()
  @RequirePermission('crm.lead.write')
  async create(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(CaptureLeadSchema)) body: z.infer<typeof CaptureLeadSchema>, @Res({ passthrough: true }) res: Response) {
    const result = await this.capture.capture(body, { kind: 'STAFF', principal: p });
    res.status(result.deduplicated ? 200 : 201);
    return result;
  }

  @Get()
  @RequirePermission('crm.lead.read')
  list(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(ListLeadsQuery)) q: z.infer<typeof ListLeadsQuery>) {
    return this.leads.list(p, {
      stage: q.stage, ownerMemberId: q.owner === 'me' ? p.memberId : q.owner, productInterest: q.product, source: q.source,
      slaState: q.sla, sort: q.sort, q: q.q, cursor: q.cursor, limit: q.limit,
    });
  }

  @Get('stats')
  @RequirePermission('crm.lead.read')
  stats(@CurrentPrincipal() p: Principal) {
    return this.leads.stats(p);
  }

  @Post('bulk-assignments')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('crm.lead.assign')
  bulkAssign(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(BulkAssignSchema)) body: z.infer<typeof BulkAssignSchema>) {
    return this.leads.bulkAssign(p, body.leadIds, body.memberId);
  }

  @Get(':id')
  @RequirePermission('crm.lead.read')
  get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.leads.get(p, id);
  }

  @Post(':id/stage-transitions')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('crm.lead.write')
  transition(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(StageTransitionSchema)) body: z.infer<typeof StageTransitionSchema>) {
    return this.leads.transition(p, id, body);
  }

  @Put(':id/qualification')
  @RequirePermission('crm.lead.write')
  qualify(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(QualificationSchema)) body: z.infer<typeof QualificationSchema>) {
    return this.leads.qualify(p, id, body);
  }

  @Put(':id/custom-fields')
  @RequirePermission('crm.lead.write')
  async replaceCustomFields(
    @CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(ReplaceCustomFieldsSchema)) body: z.infer<typeof ReplaceCustomFieldsSchema>, @Res({ passthrough: true }) res: Response,
  ) {
    const view = await this.leads.replaceCustomFields(p, id, body.customFields, parseIfMatch(ifMatch));
    res.setHeader('ETag', etagFor(view.version));
    return view;
  }

  @Put(':id/temperature')
  @RequirePermission('crm.lead.write')
  temperature(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(TemperatureSchema)) body: z.infer<typeof TemperatureSchema>) {
    return this.leads.setTemperature(p, id, body.temperature);
  }

  @Post(':id/assignments')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('crm.lead.assign')
  assign(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(AssignSchema)) body: z.infer<typeof AssignSchema>) {
    return this.leads.assign(p, id, body.memberId);
  }

  /** 201 for a new activity, 200 for an offline replay of the same clientRef. */
  @Post(':id/activities')
  @Idempotent()
  @RequirePermission('crm.activity.write')
  async logActivity(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(ActivitySchema)) body: z.infer<typeof ActivitySchema>, @Res({ passthrough: true }) res: Response) {
    const { activity, duplicate } = await this.activities.logForLead(p, id, body);
    res.status(duplicate ? 200 : 201);
    return activity;
  }

  @Post(':id/party-link')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('crm.lead.write')
  linkParty(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(PartyLinkSchema)) body: z.infer<typeof PartyLinkSchema>) {
    return this.leads.linkToCustomer(p, id, body.partyId);
  }

  @Post(':id/conversion')
  @Idempotent()
  @RequirePermission('crm.lead.convert')
  convert(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(ConversionSchema)) body: z.infer<typeof ConversionSchema>) {
    return this.conversion.convert(p, id, body);
  }
}
