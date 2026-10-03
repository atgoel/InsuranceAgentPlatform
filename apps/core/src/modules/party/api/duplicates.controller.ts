import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { DuplicateService } from '../application/duplicate.service';
import { MergeSchema, PageQuery } from './schemas';

/** Duplicate review queue (CRM08): compare, merge (reversible 30 days), dismiss. */
@Controller('api/v1')
export class DuplicatesController {
  constructor(private readonly duplicates: DuplicateService) {}

  @Get('duplicates')
  @RequirePermission('party.merge')
  queue(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(PageQuery)) q: z.infer<typeof PageQuery>) {
    return this.duplicates.queue(p, q);
  }

  @Get('duplicates/:id/comparison')
  @RequirePermission('party.merge')
  comparison(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.duplicates.comparison(p, id);
  }

  @Post('duplicates/:id/merge')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('party.merge')
  async merge(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(MergeSchema)) body: z.infer<typeof MergeSchema>) {
    const r = await this.duplicates.merge(p, id, body);
    return { mergeId: r.id, survivorId: r.survivorId, mergedId: r.mergedId, reversibleUntil: r.reversibleUntil };
  }

  @Post('duplicates/:id/dismissal')
  @HttpCode(204)
  @Idempotent()
  @RequirePermission('party.merge')
  async dismiss(@CurrentPrincipal() p: Principal, @Param('id') id: string): Promise<void> {
    await this.duplicates.dismiss(p, id);
  }

  @Post('merges/:id/reversal')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('party.merge')
  reverse(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.duplicates.reverse(p, id);
  }
}
