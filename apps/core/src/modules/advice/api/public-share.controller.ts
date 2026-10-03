import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../../kernel/tenancy/decorators';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { TENANT_RESOLVER } from '../../../kernel/tokens';
import { TenantResolver } from '../../../kernel/tenancy/tenant-resolver';
import { ShareService } from '../application/share.service';

/** Customer-facing read-only comparison. Tenant from the verified host; the token must be bound to the same tenant. */
@Controller('api/v1/public/quote-shares')
@Public()
export class PublicShareController {
  constructor(
    private readonly shares: ShareService,
    @Inject(TENANT_RESOLVER) private readonly resolver: TenantResolver,
  ) {}

  @Get(':token')
  async resolve(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('token') token: string) {
    res.setHeader('Cache-Control', 'no-store');
    const tenant = req.headers.host ? await this.resolver.resolveByHost(req.headers.host) : undefined;
    if (!tenant || tenant.status !== 'active') throw new NotFoundError('quote_share');
    return this.shares.resolve(token, tenant.tenantId);
  }
}
