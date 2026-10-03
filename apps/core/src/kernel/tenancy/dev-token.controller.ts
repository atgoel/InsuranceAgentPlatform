import { Controller, Post, Body, Inject, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Public } from './decorators';
import { signHs256, JwtClaims } from './jwt';
import { KERNEL_OPTIONS } from '../tokens';
import { KernelConfig } from '../config';

/**
 * AC-M00-25 (tenancy): POST /api/v1/dev/tokens
 * Issues a test token only when dev auth is enabled.
 * Request body: { tenantId, roles, sub?, memberId?, orgUnitId? }
 * Response: { token }
 */
@Controller('api/v1/dev')
export class DevTokenController {
  constructor(@Inject(KERNEL_OPTIONS) private readonly config: KernelConfig) {}

  @Post('tokens')
  @Public()
  createDevToken(
    @Body()
    body: {
      tenantId: string;
      roles: string[];
      sub?: string;
      memberId?: string;
      orgUnitId?: string;
    },
  ) {
    if (!this.config.devAuth) {
      throw new NotFoundException();
    }

    const now = Math.floor(Date.now() / 1000);
    const claims: JwtClaims = {
      sub: body.sub ?? 'dev_user',
      org: body.tenantId,
      roles: body.roles,
      mid: body.memberId,
      ou: body.orgUnitId,
      iat: now,
      exp: now + 8 * 3600, // 8 hours
    };

    const token = signHs256(claims, this.config.tokenSecret);
    return { token };
  }
}
