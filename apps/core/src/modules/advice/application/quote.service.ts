import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../kernel/errors/domain-errors';
import { istDate } from '../../../kernel/domain/ist';
import { Principal } from '../../../kernel/tenancy/principal';
import { ProductLine } from '../../crm/domain/lead';
import { ADVICE_EVENTS, QuoteOptionSelectedEvent, QuoteSharedEvent } from '../domain/events';
import { QuoteLine, QuoteOptionProps, QuoteRequest } from '../domain/quote';
import { ShareToken } from '../domain/share-token';
import { COMPARISON_SCOPE_FACADE, ComparisonScopeFacade, PARTY_FACADE, PartyFacade, QUOTE_REPOSITORY, QuoteRepository, SHARE_TOKEN_SIGNER, Transaction } from './ports';
import { AdviceContext, actorOf } from './advice-context';
import { AdviceScope } from './advice-scope';
import { AdviceService } from './advice.service';
import { QuoteView, QuoteViews } from './quote-views';

/** Quote line follows the opportunity's product interest (CRM ProductLine). */
const LINE_OF_INTEREST: Record<ProductLine, QuoteLine> = {
  TERM_LIFE: 'LIFE', SAVINGS_LIFE: 'LIFE', CHILD: 'LIFE', RETIREMENT: 'LIFE', HEALTH: 'HEALTH', HEALTH_FLOATER: 'HEALTH', MOTOR: 'GENERAL', OTHER: 'GENERAL',
};

const SELECTION_BUCKETS_SECONDS = [60, 300, 900, 3600, 14_400, 86_400, 259_200, 604_800];

export type OptionInput = Omit<QuoteOptionProps, 'id' | 'insurerId' | 'capturedBy' | 'capturedAt'>;

/** F14/F15 quote workspace: open, capture options in scope, share, select. Premiums are captured as quoted, never computed. */
@Injectable()
export class QuoteService {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(COMPARISON_SCOPE_FACADE) private readonly scopes: ComparisonScopeFacade,
    @Inject(PARTY_FACADE) private readonly parties: PartyFacade,
    @Inject(SHARE_TOKEN_SIGNER) private readonly signer: ShareToken,
    private readonly scope: AdviceScope,
    private readonly advice: AdviceService,
    private readonly views: QuoteViews,
    private readonly ctx: AdviceContext,
  ) {}

  open(principal: Principal, input: { opportunityId: string; insuredPartyIds: string[]; requirements: Record<string, string>; adviceRecordId?: string }): Promise<QuoteView> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const opportunity = await this.scope.opportunity(tx, principal, input.opportunityId);
      for (const partyId of input.insuredPartyIds) {
        if (!(await this.parties.summary(tx, partyId))) throw new NotFoundError('party', partyId);
      }
      if (input.adviceRecordId) {
        const advice = await this.advice.inScope(tx, principal, input.adviceRecordId);
        if (advice.props.partyId !== opportunity.partyId) throw new ValidationError('party_mismatch', 'The advice record belongs to a different party');
      }
      const quote = QuoteRequest.open({
        id: this.ctx.ids.next('qte'), opportunityId: opportunity.id, partyId: opportunity.partyId, line: LINE_OF_INTEREST[opportunity.productInterest],
        insuredPartyIds: input.insuredPartyIds, requirements: input.requirements, adviceRecordId: input.adviceRecordId, now: this.ctx.clock.now(),
      });
      await this.quotes.save(tx, quote);
      await this.ctx.recorder.record(tx, { audit: { action: 'quote.request.opened', entityType: 'quote_request', entityId: quote.props.id } });
      return this.views.build(tx, principal, quote);
    });
  }

  get(principal: Principal, id: string): Promise<QuoteView> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => this.views.build(tx, principal, await this.load(tx, principal, id)));
  }

  forOpportunity(principal: Principal, opportunityId: string): Promise<QuoteView[]> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      await this.scope.opportunity(tx, principal, opportunityId);
      const found = await this.quotes.forOpportunity(tx, opportunityId);
      return Promise.all(found.map((q) => this.views.build(tx, principal, q)));
    });
  }

  addOption(principal: Principal, quoteId: string, input: OptionInput): Promise<QuoteView> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const quote = await this.load(tx, principal, quoteId);
      const now = this.ctx.clock.now();
      await this.scopes.assertInScope(tx, principal, input.versionId, istDate(now));
      const detail = (await this.views.details([input.versionId])).get(input.versionId);
      if (!detail) throw new NotFoundError('product_version', input.versionId);
      const option: QuoteOptionProps = { ...input, id: this.ctx.ids.next('qop'), insurerId: detail.insurerId, capturedBy: actorOf(principal), capturedAt: now.toISOString() };
      quote.addOption(option, now);
      await this.quotes.save(tx, quote);
      await this.ctx.recorder.record(tx, {
        event: { type: ADVICE_EVENTS.QUOTE_OPTION_CREATED, subject: quoteId, data: { quoteRequestId: quoteId, optionId: option.id, versionId: option.versionId } },
        audit: { action: ADVICE_EVENTS.QUOTE_OPTION_CREATED, entityType: 'quote_request', entityId: quoteId },
      });
      this.ctx.metrics.counter('quote_options_total', 'Quote options captured', ['source']).inc({ source: option.source });
      return this.views.build(tx, principal, quote);
    });
  }

  removeOption(principal: Principal, quoteId: string, optionId: string): Promise<void> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const quote = await this.load(tx, principal, quoteId);
      quote.removeOption(optionId);
      await this.quotes.save(tx, quote);
      await this.ctx.recorder.record(tx, { audit: { action: 'quote.option.removed', entityType: 'quote_request', entityId: quoteId, metadata: { optionId } } });
    });
  }

  /** Marks the quote shared and issues the signed read-only link (7 days). */
  share(principal: Principal, quoteId: string): Promise<{ url: string; expiresAt: string }> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const quote = await this.load(tx, principal, quoteId);
      const now = this.ctx.clock.now();
      quote.markShared(now);
      await this.quotes.save(tx, quote);
      const { token, expiresAt } = this.signer.issue(quoteId, principal.tenantId, now);
      const event: QuoteSharedEvent = { quoteRequestId: quoteId, opportunityId: quote.props.opportunityId };
      await this.ctx.recorder.record(tx, {
        event: { type: ADVICE_EVENTS.QUOTE_SHARED, subject: quoteId, data: { ...event } },
        audit: { action: ADVICE_EVENTS.QUOTE_SHARED, entityType: 'quote_request', entityId: quoteId },
      });
      return { url: `/api/v1/public/quote-shares/${token}`, expiresAt: expiresAt.toISOString() };
    });
  }

  select(principal: Principal, quoteId: string, optionId: string): Promise<QuoteView> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const quote = await this.load(tx, principal, quoteId);
      const now = this.ctx.clock.now();
      const option = quote.select(optionId, now);
      await this.views.assertBiAcknowledged(tx, option);
      await this.quotes.save(tx, quote);
      const event: QuoteOptionSelectedEvent = { quoteRequestId: quoteId, optionId, versionId: option.versionId, totalPaise: option.premium.totalPaise };
      await this.ctx.recorder.record(tx, {
        event: { type: ADVICE_EVENTS.QUOTE_OPTION_SELECTED, subject: quoteId, data: { ...event } },
        audit: { action: ADVICE_EVENTS.QUOTE_OPTION_SELECTED, entityType: 'quote_request', entityId: quoteId },
      });
      const seconds = (now.getTime() - Date.parse(quote.props.createdAt)) / 1000;
      this.ctx.metrics.histogram('quote_selection_seconds', 'Seconds from quote open to selection', [], SELECTION_BUCKETS_SECONDS).observe(seconds);
      return this.views.build(tx, principal, quote);
    });
  }

  /** Job: OPEN/SHARED quotes whose options are all past validity become EXPIRED. */
  expireStale(tenantId: string, today: string, limit = 200): Promise<{ expired: number }> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      let expired = 0;
      for (const quote of await this.quotes.openWithValidityBefore(tx, today, limit)) {
        if (!quote.expireIfStale(today)) continue;
        await this.quotes.save(tx, quote);
        await this.ctx.recorder.record(tx, { audit: { action: 'quote.request.expired', entityType: 'quote_request', entityId: quote.props.id } });
        expired += 1;
      }
      return { expired };
    });
  }

  private async load(tx: Transaction, principal: Principal, id: string): Promise<QuoteRequest> {
    return this.scope.quoteRequest(tx, principal, await this.quotes.get(tx, id), 'quote', id);
  }
}
