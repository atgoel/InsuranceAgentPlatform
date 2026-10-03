import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { CalcOutput, CalculatorName, DEFAULT_ASSUMPTIONS, isCalculatorName, runCalculator } from '../domain/calculators';
import { CALCULATOR_RUN_REPOSITORY, CalculatorRun, CalculatorRunRepository, Transaction } from './ports';
import { AdviceContext, actorOf } from './advice-context';
import { AdviceScope } from './advice-scope';

/** F76 educational calculators; stateless unless the run is saved against a party. */
@Injectable()
export class CalculatorService {
  constructor(
    @Inject(CALCULATOR_RUN_REPOSITORY) private readonly runs: CalculatorRunRepository,
    private readonly scope: AdviceScope,
    private readonly ctx: AdviceContext,
  ) {}

  async run(principal: Principal, calculator: string, input: Record<string, unknown>, opts: { partyId?: string } = {}): Promise<CalcOutput<object>> {
    const name = this.requireName(calculator);
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      if (opts.partyId) await this.scope.party(tx, principal, opts.partyId);
      const output = this.compute(name, input);
      if (opts.partyId) await this.store(tx, principal, opts.partyId, name, input, output);
      return output;
    });
  }

  /** The party's saved runs, newest first (record scope follows the party). */
  runsFor(principal: Principal, partyId: string, limit = 50): Promise<CalculatorRun[]> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      await this.scope.party(tx, principal, partyId);
      return this.runs.forParty(tx, partyId, limit);
    });
  }

  requireName(calculator: string): CalculatorName {
    if (!isCalculatorName(calculator)) throw new NotFoundError('calculator', calculator);
    return calculator;
  }

  /** Validates and computes with the default assumptions; counts the run. */
  compute(name: CalculatorName, input: Record<string, unknown>): CalcOutput<object> {
    const output = runCalculator(name, input, DEFAULT_ASSUMPTIONS);
    this.ctx.metrics.counter('advice_calculator_runs_total', 'Calculator runs', ['calculator']).inc({ calculator: name });
    return output;
  }

  async store(tx: Transaction, principal: Principal, partyId: string, name: CalculatorName, input: Record<string, unknown>, output: CalcOutput<object>): Promise<string> {
    const ranAt = this.ctx.clock.now().toISOString();
    await this.runs.add(tx, {
      id: this.ctx.ids.next('crn'), partyId, calculator: name, inputs: input, outputs: { ...output }, assumptionsVersion: output.assumptionsVersion, ranBy: actorOf(principal), ranAt,
    });
    return ranAt;
  }
}
