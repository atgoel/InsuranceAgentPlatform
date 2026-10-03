import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { CLOCK, KERNEL_OPTIONS } from '../tokens';
import { KernelConfig } from '../config';
import { Clock } from '../domain/clock';
import { NotFoundError } from '../errors/domain-errors';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { Public } from './decorators';
import { signHs256 } from './jwt';

const DevTokenSchema = z
  .object({
    tenantId: z.string().min(1),
    roles: z.array(z.string().min(1)).min(1),
    sub: z.string().min(1).optional(),
    memberId: z.string().min(1).optional(),
    orgUnitId: z.string().min(1).optional(),
  })
  .strict();

type DevToken = z.infer<typeof DevTokenSchema>;

const DEV_TOKEN_TTL_SECONDS = 8 * 3600;

/** Development-only sign-in (M00 §4.14). Disabled unless DEV_AUTH=1 outside production; then it does not exist (404). */
@Controller('api/v1/dev')
export class DevTokenController {
  constructor(
    @Inject(KERNEL_OPTIONS) private readonly config: KernelConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post('tokens')
  @Public()
  @HttpCode(200)
  issue(@Body() raw: unknown): { token: string } {
    if (!this.config.devAuth) throw new NotFoundError('Route');
    const pipe = new ZodValidationPipe<DevToken>(DevTokenSchema);
    const body = pipe.transform(raw);
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const token = signHs256(
      { sub: body.sub ?? 'dev_user', org: body.tenantId, roles: body.roles, mid: body.memberId, ou: body.orgUnitId, realm: 'customers', iat: now, exp: now + DEV_TOKEN_TTL_SECONDS },
      this.config.tokenSecret,
    );
    return { token };
  }
}
