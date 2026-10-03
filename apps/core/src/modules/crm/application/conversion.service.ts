import { Injectable } from '@nestjs/common';
import { ForbiddenError, ValidationError } from '../../../kernel/errors/domain-errors';
import { Money } from '../../../kernel/domain/money';
import { Principal } from '../../../kernel/tenancy/principal';
import { ProductLine } from '../domain/lead';
import { Opportunity } from '../domain/opportunity';
import { CRM_EVENTS } from '../domain/events';
import { CrmContext } from './crm-context';
import { LeadDeps, LeadService } from './lead.service';

export interface ConvertInput {
  partyChoice: 'LEAD_PARTY' | { existingPartyId: string };
  productInterest: ProductLine;
  expectedPremiumPaise: number;
  startStage: 'DISCOVERY' | 'QUOTE_SHARED';
}

/** Lead → (party) + opportunity with attribution carried over (AC-M04-14). Only QUALIFIED leads convert. */
@Injectable()
export class ConversionService {
  constructor(
    private readonly d: LeadDeps,
    private readonly leads: LeadService,
    private readonly ctx: CrmContext,
  ) {}

  convert(principal: Principal, leadId: string, input: ConvertInput): Promise<{ opportunityId: string; partyId: string }> {
    if (!Number.isInteger(input.expectedPremiumPaise) || input.expectedPremiumPaise < 0) {
      throw new ValidationError('invalid_premium', 'Expected premium must be a whole number of paise');
    }
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const lead = await this.leads.requireInScope(tx, principal, leadId);
      const ownerMemberId = lead.props.ownerMemberId ?? principal.memberId;
      if (!ownerMemberId) throw new ForbiddenError('member_required', 'Assign the lead before converting it');
      const now = this.ctx.clock.now();
      let partyId = lead.props.partyId;
      if (input.partyChoice !== 'LEAD_PARTY' && input.partyChoice.existingPartyId !== partyId) {
        await this.d.parties.absorb(tx, partyId, input.partyChoice.existingPartyId);
        partyId = input.partyChoice.existingPartyId;
        lead.relinkParty(partyId);
      }
      const opportunity = Opportunity.open({
        id: this.ctx.ids.next('opp'), partyId, leadId, productInterest: input.productInterest,
        title: `${input.productInterest.replace('_', ' ').toLowerCase()} — ${(await this.d.parties.summary(tx, partyId))?.displayName ?? 'customer'}`,
        expectedPremium: Money.ofPaise(input.expectedPremiumPaise), startStage: input.startStage,
        ownerMemberId, orgUnitId: lead.props.orgUnitId, attribution: lead.props.attribution, now,
      });
      lead.markConverted(opportunity.props.id, now, principal.memberId ?? principal.userRef); // refuses unless QUALIFIED
      const port = await this.d.ports.forTenant(tx.tenantId);
      await port.saveOpportunity(tx, opportunity);
      await port.saveLead(tx, lead);
      const data = { leadId, opportunityId: opportunity.props.id, partyId };
      await this.ctx.recorder.record(tx, { event: { type: CRM_EVENTS.LEAD_CONVERTED, subject: leadId, data }, audit: { action: CRM_EVENTS.LEAD_CONVERTED, entityType: 'lead', entityId: leadId, metadata: data } });
      await this.ctx.recorder.record(tx, {
        event: { type: CRM_EVENTS.OPPORTUNITY_CREATED, subject: opportunity.props.id, data: { ...data, productInterest: input.productInterest, stage: input.startStage } },
        audit: { action: CRM_EVENTS.OPPORTUNITY_CREATED, entityType: 'opportunity', entityId: opportunity.props.id },
      });
      return { opportunityId: opportunity.props.id, partyId };
    });
  }
}
