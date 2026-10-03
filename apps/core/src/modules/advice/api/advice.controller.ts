import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { parseIfMatch } from '../../../kernel/http/if-match';
import { AdviceService } from '../application/advice.service';
import { AdviceRunSchema, CustomerChoiceSchema, NotesSchema, RecommendationSchema, StartAdviceSchema } from './schemas';

/** F78 advice record (M06 §6). */
@Controller('api/v1/advice-records')
export class AdviceController {
  constructor(private readonly advice: AdviceService) {}

  @Post()
  @Idempotent()
  @RequirePermission('advice.write')
  start(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(StartAdviceSchema)) body: z.infer<typeof StartAdviceSchema>) {
    return this.advice.start(p, body);
  }

  @Get(':id')
  @RequirePermission('advice.read')
  get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.advice.get(p, id);
  }

  @Post(':id/calculator-runs')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('advice.write')
  attachRun(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(AdviceRunSchema)) body: z.infer<typeof AdviceRunSchema>) {
    return this.advice.attachRun(p, id, body);
  }

  @Post(':id/recommendations')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('advice.write')
  recommend(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(RecommendationSchema)) body: z.infer<typeof RecommendationSchema>) {
    return this.advice.recommend(p, id, body);
  }

  @Put(':id/customer-choice')
  @RequirePermission('advice.write')
  choose(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(CustomerChoiceSchema)) body: z.infer<typeof CustomerChoiceSchema>,
  ) {
    return this.advice.recordChoice(p, id, body, parseIfMatch(ifMatch));
  }

  @Put(':id/notes')
  @RequirePermission('advice.write')
  notes(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined, @Body(new ZodValidationPipe(NotesSchema)) body: z.infer<typeof NotesSchema>) {
    return this.advice.setNotes(p, id, body.text, parseIfMatch(ifMatch));
  }

  @Post(':id/finalisation')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('advice.write')
  finalise(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.advice.finalise(p, id);
  }
}
