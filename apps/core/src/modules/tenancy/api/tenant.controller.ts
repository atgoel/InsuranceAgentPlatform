import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { etagFor, parseIfMatch } from '../../../kernel/http/if-match';
import { CLOCK } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { TenantQueryService } from '../application/tenant-query.service';
import { TieUpService } from '../application/tie-up.service';
import { FeatureFlagService } from '../application/feature-flag.service';
import { BrandKitService } from '../application/brand-kit.service';
import { TrialService } from '../application/trial.service';
import { CustomFieldService } from '../application/custom-field.service';
import {
  BrandKitSchema, ComplianceReviewSchema, DefineCustomFieldSchema, FlagKey, ListCustomFieldsQuery, ReviseCustomFieldSchema, SetFlagSchema, TieUpsSchema, TrialSchema,
} from './schemas';

/** Tenant-scoped settings (W07, W08, M19). The tenant is always the host-verified principal tenant. */
@Controller('api/v1/tenant')
export class TenantController {
  constructor(
    private readonly queries: TenantQueryService,
    private readonly tieUps: TieUpService,
    private readonly flags: FeatureFlagService,
    private readonly brand: BrandKitService,
    private readonly trials: TrialService,
    private readonly customFields: CustomFieldService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @RequirePermission('tenant.read')
  profile(@CurrentPrincipal() p: Principal) {
    return this.queries.profile(p.tenantId);
  }

  @Get('entitlements')
  @RequirePermission('tenant.read')
  entitlements(@CurrentPrincipal() p: Principal) {
    return this.queries.entitlements(p.tenantId);
  }

  @Get('tie-ups')
  @RequirePermission('tenant.read')
  getTieUps(@CurrentPrincipal() p: Principal) {
    return this.tieUps.get(p.tenantId, this.today());
  }

  @Put('tie-ups')
  @RequirePermission('tenant.tie_up.write')
  replaceTieUps(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(TieUpsSchema)) body: z.infer<typeof TieUpsSchema>) {
    return this.tieUps.replace(p.tenantId, body.tieUps, this.today());
  }

  @Get('feature-flags')
  @RequirePermission('tenant.read')
  async listFlags(@CurrentPrincipal() p: Principal) {
    return { items: await this.flags.list(p.tenantId) };
  }

  @Post('feature-flags/:key/compliance-reviews')
  @Idempotent()
  @RequirePermission('tenant.flag.write')
  review(
    @CurrentPrincipal() p: Principal,
    @Param('key', new ZodValidationPipe(FlagKey)) key: z.infer<typeof FlagKey>,
    @Body(new ZodValidationPipe(ComplianceReviewSchema)) body: z.infer<typeof ComplianceReviewSchema>,
  ) {
    return this.flags.recordComplianceReview(p.tenantId, key, body.reviewRef);
  }

  @Put('feature-flags/:key')
  @RequirePermission('tenant.flag.write')
  setFlag(
    @CurrentPrincipal() p: Principal,
    @Param('key', new ZodValidationPipe(FlagKey)) key: z.infer<typeof FlagKey>,
    @Body(new ZodValidationPipe(SetFlagSchema)) body: z.infer<typeof SetFlagSchema>,
  ) {
    return this.flags.setEnabled(p.tenantId, key, body.enabled);
  }

  @Get('brand-kit')
  @RequirePermission('tenant.read')
  getBrand(@CurrentPrincipal() p: Principal) {
    return this.brand.get(p.tenantId);
  }

  @Put('brand-kit')
  @RequirePermission('tenant.brand.write')
  updateBrand(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(BrandKitSchema)) body: z.infer<typeof BrandKitSchema>) {
    return this.brand.update(p.tenantId, body);
  }

  @Post('trials')
  @Idempotent()
  @RequirePermission('tenant.plan.write')
  startTrial(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(TrialSchema)) body: z.infer<typeof TrialSchema>) {
    return this.trials.start(p.tenantId, body.planCode);
  }

  @Get('custom-fields')
  @RequirePermission('tenant.read')
  listCustomFields(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(ListCustomFieldsQuery)) q: z.infer<typeof ListCustomFieldsQuery>) {
    return this.customFields.list(p, q.entity);
  }

  @Post('custom-fields')
  @Idempotent()
  @RequirePermission('tenant.custom_field.write')
  defineCustomField(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(DefineCustomFieldSchema)) body: z.infer<typeof DefineCustomFieldSchema>) {
    return this.customFields.define(p, body);
  }

  @Patch('custom-fields/:id')
  @RequirePermission('tenant.custom_field.write')
  async reviseCustomField(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(ReviseCustomFieldSchema)) body: z.infer<typeof ReviseCustomFieldSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const def = await this.customFields.revise(p, id, body, parseIfMatch(ifMatch));
    res.setHeader('ETag', etagFor(def.version));
    return def;
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}
