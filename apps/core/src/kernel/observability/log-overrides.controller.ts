import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, OperatorOnly } from '../tenancy/decorators';
import { Principal } from '../tenancy/principal';
import { DEBUG_TOKENS, LOGGER, LOG_OVERRIDES } from '../tokens';
import { NotFoundError } from '../errors/domain-errors';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { Logger } from './logger';
import { LogOverride, LogOverrideStore } from './log-overrides';
import { DebugTokenService } from './debug-token';

const OverrideSchema = z
  .object({
    scope: z.object({ tenantId: z.string().min(1).optional(), module: z.string().min(1).optional(), actor: z.string().min(1).optional() }).strict(),
    ttlMinutes: z.number().int(),
  })
  .strict();
const DebugTokenSchema = z.object({ tenantId: z.string().min(1), ttlMinutes: z.number().int() }).strict();

/** Debug-on-demand controls (spec 02 §4). Every action is security-logged and TTL-bound so cost cannot leak. */
@Controller('api/v1/ops')
@OperatorOnly()
export class LogOverridesController {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(LOG_OVERRIDES) private readonly overrides: LogOverrideStore,
    @Inject(DEBUG_TOKENS) private readonly debugTokens: DebugTokenService,
  ) {}

  @Put('log-overrides')
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(OverrideSchema)) body: z.infer<typeof OverrideSchema>, @CurrentPrincipal() principal: Principal): LogOverride {
    const override = this.overrides.put({ scope: body.scope, ttlMinutes: body.ttlMinutes, createdBy: principal.userRef });
    this.logger.security('security.log_override.created', 'Log override created', { id: override.id, scope: body.scope, ttlMinutes: body.ttlMinutes });
    return override;
  }

  @Get('log-overrides')
  list(): { items: LogOverride[] } {
    return { items: this.overrides.list() };
  }

  @Delete('log-overrides/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    if (!this.overrides.remove(id)) throw new NotFoundError('LogOverride', id);
    this.logger.security('security.log_override.removed', 'Log override removed', { id });
  }

  @Post('debug-tokens')
  @HttpCode(200)
  issueDebugToken(@Body(new ZodValidationPipe(DebugTokenSchema)) body: z.infer<typeof DebugTokenSchema>): { token: string } {
    const token = this.debugTokens.issue(body);
    this.logger.security('security.debug_token.issued', 'Debug token issued', { tenantId: body.tenantId, ttlMinutes: body.ttlMinutes });
    return { token };
  }
}
