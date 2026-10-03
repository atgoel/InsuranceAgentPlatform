import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { ConsentService } from '../application/consent.service';
import { consentView } from './views';
import { ConsentSchema, ContactabilityQuerySchema, SuppressionSchema } from './schemas';

/** Consent ledger, contactability and suppression (F37). */
@Controller('api/v1')
export class ConsentsController {
  constructor(private readonly consents: ConsentService) {}

  @Get('parties/:id/consents')
  @RequirePermission('party.read')
  async ledger(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const { summary, history } = await this.consents.ledger(p, id);
    return { summary, history: history.map(consentView) };
  }

  @Post('parties/:id/consents')
  @Idempotent()
  @RequirePermission('party.consent.write')
  async record(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(ConsentSchema)) body: z.infer<typeof ConsentSchema>) {
    return consentView(await this.consents.record(p, id, body));
  }

  @Get('parties/:id/contactability')
  @RequirePermission('party.read')
  contactability(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Query(new ZodValidationPipe(ContactabilityQuerySchema)) q: z.infer<typeof ContactabilityQuerySchema>) {
    return this.consents.contactability(p, id, q.channel, q.purpose);
  }

  @Post('suppressions')
  @Idempotent()
  @RequirePermission('party.suppression.write')
  async suppress(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(SuppressionSchema)) body: z.infer<typeof SuppressionSchema>) {
    const { value, contactHash, ...rest } = body;
    const s = await this.consents.suppress(p, value !== undefined ? { ...rest, value } : { ...rest, contactHash: contactHash as string });
    return { id: s.id, channel: s.channel, reason: s.reason, from: s.from, to: s.to };
  }
}
