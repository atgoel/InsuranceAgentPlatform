import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { AcknowledgementMethod, BiRecord, BiRecordProps } from '../domain/benefit-illustration';
import { ADVICE_EVENTS } from '../domain/events';
import { BI_REPOSITORY, BiRepository, QUOTE_REPOSITORY, QuoteRepository, Transaction } from './ports';
import { AdviceContext, actorOf } from './advice-context';
import { AdviceScope } from './advice-scope';

/** F75 benefit-illustration evidence: the insurer's document pointer and the customer's acknowledgement. */
@Injectable()
export class BiService {
  constructor(
    @Inject(BI_REPOSITORY) private readonly illustrations: BiRepository,
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    private readonly scope: AdviceScope,
    private readonly ctx: AdviceContext,
  ) {}

  attach(principal: Principal, optionId: string, input: { documentRef: string; insurerBiVersion: string }): Promise<BiRecordProps> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      await this.requireOptionInScope(tx, principal, optionId, 'quote_option');
      const bi = BiRecord.attach({ id: this.ctx.ids.next('bil'), quoteOptionId: optionId, ...input, uploadedBy: actorOf(principal), now: this.ctx.clock.now() });
      await this.illustrations.save(tx, bi);
      await this.ctx.recorder.record(tx, { audit: { action: 'advice.bi.attached', entityType: 'benefit_illustration', entityId: bi.props.id, metadata: { quoteOptionId: optionId } } });
      return structuredClone(bi.props);
    });
  }

  acknowledge(principal: Principal, biId: string, input: { method: AcknowledgementMethod; evidenceRef?: string }): Promise<BiRecordProps> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const bi = await this.illustrations.get(tx, biId);
      if (!bi) throw new NotFoundError('benefit_illustration', biId);
      await this.requireOptionInScope(tx, principal, bi.props.quoteOptionId, 'benefit_illustration', biId);
      bi.acknowledge({ method: input.method, by: actorOf(principal), evidenceRef: input.evidenceRef }, this.ctx.clock.now());
      await this.illustrations.save(tx, bi);
      await this.ctx.recorder.record(tx, {
        event: { type: ADVICE_EVENTS.BI_ACKNOWLEDGED, subject: biId, data: { biId, quoteOptionId: bi.props.quoteOptionId, method: input.method } },
        audit: { action: ADVICE_EVENTS.BI_ACKNOWLEDGED, entityType: 'benefit_illustration', entityId: biId },
      });
      return structuredClone(bi.props);
    });
  }

  /** The option's quote must be inside the caller's record scope; otherwise the BI or option looks missing. */
  private async requireOptionInScope(tx: Transaction, principal: Principal, optionId: string, entity: string, id = optionId): Promise<void> {
    const found = await this.quotes.findOption(tx, optionId);
    await this.scope.quoteRequest(tx, principal, found?.request, entity, id);
  }
}
