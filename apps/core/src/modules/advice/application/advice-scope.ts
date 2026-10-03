import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { AdviceRecord } from '../domain/advice-record';
import { QuoteRequest } from '../domain/quote';
import { inScope } from '../../crm/application/crm-scope';
import { OPPORTUNITY_LOOKUP, OpportunityLookup, OpportunitySnapshot, PARTY_FACADE, PartyFacade, PartySummary, RECORD_SCOPE_PROVIDER, RecordScopeProvider, Transaction } from './ports';

/** Record scope for M06 (§6): follows the party (M03) or the opportunity (M04). Out of scope looks like missing (404). */
@Injectable()
export class AdviceScope {
  constructor(
    @Inject(PARTY_FACADE) private readonly parties: PartyFacade,
    @Inject(RECORD_SCOPE_PROVIDER) private readonly scopes: RecordScopeProvider,
    @Inject(OPPORTUNITY_LOOKUP) private readonly opportunities: OpportunityLookup,
  ) {}

  async party(tx: Transaction, principal: Principal, partyId: string): Promise<PartySummary> {
    const summary = await this.parties.summary(tx, partyId);
    if (!summary || !inScope({ ownerMemberId: summary.ownerMemberId, orgUnitId: summary.orgUnitId }, await this.scopes.resolve(tx, principal))) {
      throw new NotFoundError('party', partyId);
    }
    return summary;
  }

  async opportunity(tx: Transaction, principal: Principal, opportunityId: string): Promise<OpportunitySnapshot> {
    const snapshot = await this.opportunities.inScope(tx, principal, opportunityId);
    if (!snapshot) throw new NotFoundError('opportunity', opportunityId);
    return snapshot;
  }

  /** An advice record is visible through its opportunity when it has one, otherwise through its party. */
  async adviceRecord(tx: Transaction, principal: Principal, record: AdviceRecord | undefined, id: string): Promise<AdviceRecord> {
    if (!record) throw new NotFoundError('advice_record', id);
    const { opportunityId, partyId } = record.props;
    try {
      if (opportunityId) await this.opportunity(tx, principal, opportunityId);
      else await this.party(tx, principal, partyId);
    } catch (error) {
      if (error instanceof NotFoundError) throw new NotFoundError('advice_record', id);
      throw error;
    }
    return record;
  }

  /** A quote request is visible through its opportunity (M04 record scope). */
  async quoteRequest(tx: Transaction, principal: Principal, quote: QuoteRequest | undefined, entity: string, id: string): Promise<QuoteRequest> {
    if (!quote) throw new NotFoundError(entity, id);
    if (!(await this.opportunities.inScope(tx, principal, quote.props.opportunityId))) throw new NotFoundError(entity, id);
    return quote;
  }
}
