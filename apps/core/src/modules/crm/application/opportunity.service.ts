import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { DomainEvent } from '../../../kernel/domain/domain-event';
import { Principal } from '../../../kernel/tenancy/principal';
import { ProductLine } from '../domain/lead';
import { Opportunity, OpportunityStage } from '../domain/opportunity';
import { LostReason } from '../domain/lead';
import { CRM_EVENTS } from '../domain/events';
import { CRM_PORT_FACTORY, OPPORTUNITY_REPOSITORY, OpportunityLookup, OpportunityRepository, OpportunitySnapshot, RECORD_SCOPE_PROVIDER, RecordScopeProvider, Transaction } from './ports';
import { DefaultCrmPortFactory } from './crm-port';
import { CrmContext } from './crm-context';
import { inScope } from './crm-scope';

const OPEN_STAGES: OpportunityStage[] = ['DISCOVERY', 'QUOTE_SHARED', 'PROPOSAL_COMPLETE', 'INSURER_PENDING'];
const DAY_MS = 86_400_000;

export interface PolicyIssuedEvent {
  proposalId: string;
  opportunityId?: string;
  policySaleId: string;
}

/** Pipeline (CRM03): board, adjacent moves, loss; ISSUED only via the insurer-confirmation event (AC-M04-05/15). */
@Injectable()
export class OpportunityService implements OpportunityLookup {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly opportunities: OpportunityRepository,
    @Inject(RECORD_SCOPE_PROVIDER) private readonly scopes: RecordScopeProvider,
    @Inject(CRM_PORT_FACTORY) private readonly ports: DefaultCrmPortFactory,
    private readonly ctx: CrmContext,
  ) {}

  board(principal: Principal, filter: { ownerMemberId?: string; productInterest?: ProductLine }) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const now = this.ctx.clock.now();
      const all = await this.opportunities.board(tx, { scope: await this.scopes.resolve(tx, principal), ...filter });
      const columns = OPEN_STAGES.map((stage) => {
        const items = all.filter((o) => o.props.stage === stage);
        return { stage, count: items.length, totalExpectedPremiumPaise: sumPaise(items), items: items.map((o) => opportunityView(o, now)) };
      });
      const open = all.filter((o) => OPEN_STAGES.includes(o.props.stage));
      return {
        columns,
        closed: { issued: all.filter((o) => o.props.stage === 'ISSUED').length, lost: all.filter((o) => o.props.stage === 'LOST').length },
        stats: { openCount: open.length, openExpectedPremiumPaise: sumPaise(open), medianDaysToIssue: medianDaysToIssue(all), winRate90d: winRate(all, now) },
      };
    });
  }

  move(principal: Principal, id: string, to: OpportunityStage) {
    return this.mutate(principal, id, (o, now) => o.move(to, now), undefined);
  }

  markLost(principal: Principal, id: string, reason: LostReason) {
    return this.mutate(principal, id, (o, now) => o.markLost(reason, now), CRM_EVENTS.OPPORTUNITY_LOST);
  }

  /** Subscriber for proposal.policy.issued — the only path to ISSUED (exactly once via the kernel inbox). */
  async onPolicyIssued(event: DomainEvent<PolicyIssuedEvent>): Promise<void> {
    await this.ctx.uow.run(event.tenantId, async (tx) => {
      const opp = event.data.opportunityId
        ? await this.opportunities.get(tx, event.data.opportunityId)
        : await this.opportunities.findByProposal(tx, event.data.proposalId);
      if (!opp || opp.props.stage === 'ISSUED') return;
      opp.markIssued({ policySaleId: event.data.policySaleId, confirmedBy: 'INSURER' }, this.ctx.clock.now());
      await (await this.ports.forTenant(tx.tenantId)).saveOpportunity(tx, opp);
      await this.ctx.recorder.record(tx, {
        event: { type: CRM_EVENTS.OPPORTUNITY_ISSUED, subject: opp.props.id, data: { opportunityId: opp.props.id, policySaleId: event.data.policySaleId } },
        audit: { action: CRM_EVENTS.OPPORTUNITY_ISSUED, entityType: 'opportunity', entityId: opp.props.id },
      });
    });
  }

  private mutate(principal: Principal, id: string, change: (o: Opportunity, now: Date) => void, eventType: string | undefined) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const opp = await this.requireInScope(tx, principal, id);
      const now = this.ctx.clock.now();
      change(opp, now);
      await (await this.ports.forTenant(tx.tenantId)).saveOpportunity(tx, opp);
      if (eventType) {
        await this.ctx.recorder.record(tx, {
          event: { type: eventType, subject: id, data: { opportunityId: id, stage: opp.props.stage, lostReason: opp.props.lostReason ?? null } },
          audit: { action: eventType, entityType: 'opportunity', entityId: id },
        });
      }
      return opportunityView(opp, now);
    });
  }

  /** Subscriber for quote.request.shared (M06): a DISCOVERY opportunity moves to QUOTE_SHARED; later stages stay. */
  async onQuoteShared(event: DomainEvent<{ opportunityId?: string }>): Promise<void> {
    const id = event.data.opportunityId;
    if (!id) return;
    await this.ctx.uow.run(event.tenantId, async (tx) => {
      const opp = await this.opportunities.get(tx, id);
      if (!opp || opp.props.stage !== 'DISCOVERY') return;
      opp.move('QUOTE_SHARED', this.ctx.clock.now());
      await (await this.ports.forTenant(tx.tenantId)).saveOpportunity(tx, opp);
    });
  }

  /** OpportunityLookup (M06): the opportunity when it is inside the caller's record scope. */
  async inScope(tx: Transaction, principal: Principal, id: string): Promise<OpportunitySnapshot | undefined> {
    const opp = await this.opportunities.get(tx, id);
    if (!opp || !inScope(opp.props, await this.scopes.resolve(tx, principal))) return undefined;
    const p = opp.props;
    return { id: p.id, partyId: p.partyId, ownerMemberId: p.ownerMemberId, orgUnitId: p.orgUnitId, productInterest: p.productInterest, stage: p.stage };
  }

  private async requireInScope(tx: Transaction, principal: Principal, id: string): Promise<Opportunity> {
    const opp = await this.opportunities.get(tx, id);
    if (!opp || !inScope(opp.props, await this.scopes.resolve(tx, principal))) throw new NotFoundError('opportunity', id);
    return opp;
  }
}

export function opportunityView(o: Opportunity, now: Date) {
  const p = o.props;
  return { ...p, expectedPremium: p.expectedPremium.toJSON(), ageInStageDays: o.ageInStageDays(now) };
}

function sumPaise(items: Opportunity[]): number {
  return items.reduce((sum, o) => sum + o.props.expectedPremium.toJSON().amountPaise, 0);
}

function medianDaysToIssue(all: Opportunity[]): number | null {
  const days = all.filter((o) => o.props.stage === 'ISSUED').map((o) => (Date.parse(o.props.stageEnteredAt) - Date.parse(o.props.createdAt)) / DAY_MS).sort((a, b) => a - b);
  if (days.length === 0) return null;
  const mid = Math.floor(days.length / 2);
  return Math.round(days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2);
}

/** Issued ÷ (issued + lost) among opportunities closed in the last 90 days. */
function winRate(all: Opportunity[], now: Date): number | null {
  const since = now.getTime() - 90 * DAY_MS;
  const closed = all.filter((o) => (o.props.stage === 'ISSUED' || o.props.stage === 'LOST') && Date.parse(o.props.stageEnteredAt) >= since);
  if (closed.length === 0) return null;
  return Math.round((closed.filter((o) => o.props.stage === 'ISSUED').length / closed.length) * 100);
}
