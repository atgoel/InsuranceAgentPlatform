import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { BiService } from '../application/bi.service';
import { QuoteService } from '../application/quote.service';
import { AcknowledgeBiSchema, AttachBiSchema, OpenQuoteSchema, OptionSchema, QuotesQuery, SelectionSchema } from './schemas';

/** Quote workspace (F14, F15) and benefit-illustration evidence (F75), M06 §6. */
@Controller('api/v1')
export class QuotesController {
  constructor(
    private readonly quotes: QuoteService,
    private readonly illustrations: BiService,
  ) {}

  @Post('quotes')
  @Idempotent()
  @RequirePermission('quote.write')
  open(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(OpenQuoteSchema)) body: z.infer<typeof OpenQuoteSchema>) {
    return this.quotes.open(p, body);
  }

  @Get('quotes')
  @RequirePermission('quote.read')
  async list(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(QuotesQuery)) q: z.infer<typeof QuotesQuery>) {
    return { items: await this.quotes.forOpportunity(p, q.opportunityId) };
  }

  @Get('quotes/:id')
  @RequirePermission('quote.read')
  get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.quotes.get(p, id);
  }

  @Post('quotes/:id/options')
  @Idempotent()
  @RequirePermission('quote.write')
  addOption(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(OptionSchema)) body: z.infer<typeof OptionSchema>) {
    return this.quotes.addOption(p, id, body);
  }

  @Delete('quotes/:id/options/:optionId')
  @HttpCode(204)
  @RequirePermission('quote.write')
  removeOption(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Param('optionId') optionId: string) {
    return this.quotes.removeOption(p, id, optionId);
  }

  @Post('quotes/:id/shares')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('quote.write')
  share(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.quotes.share(p, id);
  }

  @Post('quotes/:id/selection')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('quote.write')
  select(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(SelectionSchema)) body: z.infer<typeof SelectionSchema>) {
    return this.quotes.select(p, id, body.optionId);
  }

  @Post('quote-options/:optionId/benefit-illustrations')
  @Idempotent()
  @RequirePermission('quote.write')
  attachBi(@CurrentPrincipal() p: Principal, @Param('optionId') optionId: string, @Body(new ZodValidationPipe(AttachBiSchema)) body: z.infer<typeof AttachBiSchema>) {
    return this.illustrations.attach(p, optionId, body);
  }

  @Post('benefit-illustrations/:id/acknowledgement')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('quote.write')
  acknowledgeBi(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(AcknowledgeBiSchema)) body: z.infer<typeof AcknowledgeBiSchema>) {
    return this.illustrations.acknowledge(p, id, body);
  }
}
