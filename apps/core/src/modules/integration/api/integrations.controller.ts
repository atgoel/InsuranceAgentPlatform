import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { ValidationError } from '../../../kernel/errors/domain-errors';
import { IntegrationAdminService } from '../application/integration-admin.service';
import { CertificationService } from '../application/certification.service';
import { DeadLetterService } from '../application/dead-letter.service';
const pinInput = z.object({
  version: z.string().min(1)
}).strict();
const listQuery = z.object({
  status: z.enum(['OPEN', 'REPLAYED', 'DISCARDED']).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
@Controller('api/v1/integrations')
export class IntegrationsController {
  constructor(
    private readonly admin: IntegrationAdminService,
    private readonly certification: CertificationService,
    private readonly letters: DeadLetterService
  ) { }
  @Get()
  @RequirePermission('integration.read')
  list(
  @CurrentPrincipal()
  principal: Principal) {
    return this.admin.list(principal);
  }
  @Get('dead-letters')
  @RequirePermission('integration.read')
  deadLetters(
  @CurrentPrincipal()
  principal: Principal,
  @Query(new ZodValidationPipe(listQuery))
  query: z.infer<typeof listQuery>) {
    return this.letters.list(principal, query);
  }
  @Get('dead-letters/:id')
  @RequirePermission('integration.read')
  detail(
  @CurrentPrincipal()
  principal: Principal,
  @Param('id')
  id: string) {
    return this.letters.detail(principal, id);
  }
  @Post('dead-letters/:id/replay')
  @HttpCode(200)
  @RequirePermission('integration.write')
  @Idempotent()
  replay(
  @CurrentPrincipal()
  principal: Principal,
  @Param('id')
  id: string) {
    return this.letters.replay(principal, id);
  }
  @Post('dead-letters/:id/discard')
  @HttpCode(200)
  @RequirePermission('integration.write')
  @Idempotent()
  discard(
  @CurrentPrincipal()
  principal: Principal,
  @Param('id')
  id: string,
  @Body()
  input: unknown) {
    const parsed = z.object({
      reason: z.string().trim().min(1).max(500)
    }).strict().safeParse(input);
    if (!parsed.success)
      throw new ValidationError('discard_reason_required', 'Discard reason must be 1 to 500 characters');
    return this.letters.discard(principal, id, parsed.data.reason);
  }
  @Put(':adapterId/pin')
  @RequirePermission('integration.write')
  pin(
  @CurrentPrincipal()
  principal: Principal,
  @Param('adapterId')
  adapterId: string,
  @Body(new ZodValidationPipe(pinInput))
  input: z.infer<typeof pinInput>) {
    return this.admin.pin(principal, adapterId, input.version);
  }
  @Post(':adapterId/certifications')
  @HttpCode(200)
  @RequirePermission('integration.write')
  @Idempotent()
  certify(
  @CurrentPrincipal()
  principal: Principal,
  @Param('adapterId')
  adapterId: string) {
    return this.certification.run(principal, adapterId);
  }
}
