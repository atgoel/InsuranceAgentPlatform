import { createHmac } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../../../kernel/tenancy/decorators';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { KERNEL_OPTIONS, TENANT_RESOLVER } from '../../../kernel/tokens';
import { KernelConfig } from '../../../kernel/config';
import { TenantResolver } from '../../../kernel/tenancy/tenant-resolver';
import { LeadCaptureService } from '../application/lead-capture.service';
import { PublicLeadSchema } from './schemas';

/** Microsite / web-form capture. Tenant from the verified host only; the response never reveals owner or dedup. */
@Controller('api/v1/public/leads')
@Public()
export class PublicLeadsController {
  constructor(
    private readonly capture: LeadCaptureService,
    @Inject(TENANT_RESOLVER) private readonly resolver: TenantResolver,
    @Inject(KERNEL_OPTIONS) private readonly config: KernelConfig,
  ) {}

  @Post()
  @HttpCode(202)
  @Idempotent()
  async create(@Req() req: Request, @Body(new ZodValidationPipe(PublicLeadSchema)) body: z.infer<typeof PublicLeadSchema>) {
    const tenant = req.headers.host ? await this.resolver.resolveByHost(req.headers.host) : undefined;
    if (!tenant || tenant.status !== 'active') throw new NotFoundError('Tenant');
    const { website, ...input } = body;
    // The IP is never stored: only a keyed hash, used for the rolling rate window.
    const ipHash = createHmac('sha256', this.config.actorPepper).update(req.ip ?? 'unknown').digest('hex');
    await this.capture.capture(input, { kind: 'PUBLIC', tenantId: tenant.tenantId, ipHash, honeypot: website });
    return { received: true };
  }
}
