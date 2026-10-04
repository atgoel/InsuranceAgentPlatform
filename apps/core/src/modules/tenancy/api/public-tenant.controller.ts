import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../../kernel/tenancy/decorators';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { TENANT_RESOLVER } from '../../../kernel/tokens';
import { TenantResolver } from '../../../kernel/tenancy/tenant-resolver';
import { BrandKitService } from '../application/brand-kit.service';
import { TenantQueryService } from '../application/tenant-query.service';
import { SoloSignupService } from '../application/solo-signup.service';
import { StartSignupSchema, VerifySignupSchema } from './schemas';

const LANGUAGES = ['en', 'hi'];

/** Unauthenticated endpoints: login-screen branding by host, and solo self-signup (F94). */
@Controller('api/v1/public')
@Public()
export class PublicTenantController {
  constructor(
    @Inject(TENANT_RESOLVER) private readonly resolver: TenantResolver,
    private readonly brand: BrandKitService,
    private readonly queries: TenantQueryService,
    private readonly signups: SoloSignupService,
  ) {}

  @Get('tenant-config')
  async tenantConfig(@Headers('host') host: string | undefined) {
    const resolved = host ? await this.resolver.resolveByHost(host) : undefined;
    if (!resolved || resolved.status !== 'active') throw new NotFoundError('Tenant');
    const [summary, kit] = await Promise.all([this.queries.summary(resolved.tenantId), this.brand.get(resolved.tenantId)]);
    const brand = {
      brandName: kit.brandName,
      primary: kit.primary,
      secondary: kit.secondary,
      typeface: kit.typeface,
      logoRef: kit.logoRef,
      poweredByVisible: kit.poweredByVisible,
    };
    return { displayName: summary.displayName, brand, languages: LANGUAGES };
  }

  @Post('solo-signups')
  @Idempotent()
  start(@Body(new ZodValidationPipe(StartSignupSchema)) body: z.infer<typeof StartSignupSchema>) {
    return this.signups.start({
      phone: body.phone,
      displayName: body.displayName,
      licence: body.licence,
      consentNoticeVersion: body.consent.noticeVersion,
    });
  }

  @Post('solo-signups/:id/verifications')
  @HttpCode(200)
  @Idempotent()
  verify(@Param('id') id: string, @Body(new ZodValidationPipe(VerifySignupSchema)) body: z.infer<typeof VerifySignupSchema>) {
    return this.signups.verify(id, body.otp);
  }
}
