import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { CalculatorService } from '../application/calculator.service';
import { CalculatorRunSchema } from './schemas';

/** F76 educational calculators (M06 §6). Unknown calculator names are 404; inputs are validated by the calculator (400 with field errors). */
@Controller('api/v1/calculators')
export class CalculatorsController {
  constructor(private readonly calculators: CalculatorService) {}

  @Post(':calculator/runs')
  @HttpCode(200)
  @RequirePermission('advice.calculate')
  run(@CurrentPrincipal() p: Principal, @Param('calculator') calculator: string, @Body(new ZodValidationPipe(CalculatorRunSchema)) body: z.infer<typeof CalculatorRunSchema>) {
    return this.calculators.run(p, calculator, body.input, { partyId: body.partyId });
  }
}
