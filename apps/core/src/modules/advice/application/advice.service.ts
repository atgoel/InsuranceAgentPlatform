import { Inject, Injectable } from '@nestjs/common';
import { PreconditionFailedError, ValidationError } from '../../../kernel/errors/domain-errors';
import { istDate } from '../../../kernel/domain/ist';
import { Principal } from '../../../kernel/tenancy/principal';
import { AdviceRecord } from '../domain/advice-record';
import { ADVICE_EVENTS } from '../domain/events';
import { LineOfBusiness } from '../../catalogue/domain/catalogue';
import { ADVICE_REPOSITORY, AdviceRepository, COMPARISON_SCOPE_FACADE, ComparisonScopeFacade, Transaction } from './ports';
import { AdviceContext, actorOf } from './advice-context';
import { AdviceScope } from './advice-scope';
import { AdviceView, AdviceViews } from './advice-views';
import { CalculatorService } from './calculator.service';

export type AdviceCategory = Parameters<ComparisonScopeFacade['scopeFor']>[2]['category'];

interface Change {
  apply: (record: AdviceRecord, now: Date, tx: Transaction) => void | Promise<void>;
  audit: string;
  expectedVersion?: number;
  event?: (record: AdviceRecord) => { type: string; subject: string; data: Record<string, unknown> };
}

/** F78 advice record: scope snapshot at start, recommendations only from what was shown, finalised once. */
@Injectable()
export class AdviceService {
  constructor(
    @Inject(ADVICE_REPOSITORY) private readonly records: AdviceRepository,
    @Inject(COMPARISON_SCOPE_FACADE) private readonly scopes: ComparisonScopeFacade,
    private readonly scope: AdviceScope,
    private readonly views: AdviceViews,
    private readonly calculators: CalculatorService,
    private readonly ctx: AdviceContext,
  ) {}

  start(principal: Principal, input: { partyId: string; opportunityId?: string; line?: LineOfBusiness; category?: AdviceCategory }): Promise<AdviceView> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      // Same rule as reading the record: through the opportunity when there is one, otherwise through the party.
      if (input.opportunityId) {
        const opportunity = await this.scope.opportunity(tx, principal, input.opportunityId);
        if (opportunity.partyId !== input.partyId) throw new ValidationError('party_mismatch', 'The opportunity belongs to a different party');
      } else {
        await this.scope.party(tx, principal, input.partyId);
      }
      const now = this.ctx.clock.now();
      const date = istDate(now);
      const result = await this.scopes.scopeFor(tx, principal, { line: input.line, category: input.category, date });
      const record = AdviceRecord.start({
        id: this.ctx.ids.next('adv'), partyId: input.partyId, opportunityId: input.opportunityId, advisorMemberId: actorOf(principal), now,
        scope: { disclosure: result.disclosure, entityType: result.entityType, versionIdsShown: result.versions.map((v) => v.versionId), excludedCount: result.excluded.length, evaluatedOn: date },
      });
      await this.records.save(tx, record);
      await this.ctx.recorder.record(tx, { audit: { action: 'advice.record.started', entityType: 'advice_record', entityId: record.props.id } });
      return this.views.build(record);
    });
  }

  get(principal: Principal, id: string): Promise<AdviceView> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => this.views.build(await this.load(tx, principal, id)));
  }

  attachRun(principal: Principal, id: string, input: { calculator: string; input: Record<string, unknown> }): Promise<AdviceView> {
    const name = this.calculators.requireName(input.calculator);
    return this.mutate(principal, id, {
      audit: 'advice.record.calculator_run_added',
      apply: async (record, now, tx) => {
        const output = this.calculators.compute(name, input.input);
        record.addCalculatorRun({ calculator: name, inputs: input.input, outputs: { ...output }, assumptionsVersion: output.assumptionsVersion, ranAt: now.toISOString() });
        await this.calculators.store(tx, principal, record.props.partyId, name, input.input, output);
      },
    });
  }

  recommend(principal: Principal, id: string, input: { versionId: string; rationale: string }): Promise<AdviceView> {
    return this.mutate(principal, id, { audit: 'advice.record.recommended', apply: (record) => record.recommend(input.versionId, input.rationale) });
  }

  recordChoice(principal: Principal, id: string, input: { versionId: string; reasonIfDifferent?: string }, expectedVersion: number): Promise<AdviceView> {
    return this.mutate(principal, id, { audit: 'advice.record.choice_recorded', expectedVersion, apply: (record) => record.recordChoice(input.versionId, input.reasonIfDifferent) });
  }

  setNotes(principal: Principal, id: string, text: string, expectedVersion: number): Promise<AdviceView> {
    return this.mutate(principal, id, { audit: 'advice.record.notes_updated', expectedVersion, apply: (record) => record.setNotes(text) });
  }

  finalise(principal: Principal, id: string): Promise<AdviceView> {
    return this.mutate(principal, id, {
      audit: ADVICE_EVENTS.ADVICE_FINALISED,
      apply: (record, now) => record.finalise(now),
      event: (record) => ({
        type: ADVICE_EVENTS.ADVICE_FINALISED,
        subject: record.props.id,
        data: {
          adviceRecordId: record.props.id,
          partyId: record.props.partyId,
          opportunityId: record.props.opportunityId ?? null,
          recommendedCount: record.props.recommended.length,
          choseRecommended: record.choseRecommended,
        },
      }),
    });
  }

  /** Scope-checked load for the sibling services (quotes link to advice records). */
  async inScope(tx: Transaction, principal: Principal, id: string): Promise<AdviceRecord> {
    return this.load(tx, principal, id);
  }

  private load(tx: Transaction, principal: Principal, id: string): Promise<AdviceRecord> {
    return this.records.get(tx, id).then((record) => this.scope.adviceRecord(tx, principal, record, id));
  }

  private mutate(principal: Principal, id: string, change: Change): Promise<AdviceView> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const record = await this.load(tx, principal, id);
      if (change.expectedVersion !== undefined && record.props.version !== change.expectedVersion) {
        throw new PreconditionFailedError('version_mismatch', 'The advice record was changed by someone else; reload and retry');
      }
      await change.apply(record, this.ctx.clock.now(), tx);
      await this.records.save(tx, record);
      await this.ctx.recorder.record(tx, {
        event: change.event?.(record),
        audit: { action: change.audit, entityType: 'advice_record', entityId: id },
      });
      return this.views.build(record);
    });
  }
}
