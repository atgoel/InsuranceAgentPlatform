import { Inject, Injectable } from '@nestjs/common';
import { Lead, lineOfBusiness, ProductLine } from '../domain/lead';
import { Opportunity } from '../domain/opportunity';
import {
  LEAD_REPOSITORY, LeadRepository, OPPORTUNITY_REPOSITORY, OpportunityRepository, POS_ELIGIBILITY, PosEligibilityPolicy, SELLER_DIRECTORY,
  SellerDirectory, Transaction,
} from './ports';
import { CrmContext } from './crm-context';
import type { TwentyWebhookEvent, WebhookOutcome } from './twenty-webhook.service';

type Owned = { kind: 'lead'; record: Lead; changedAt: string } | { kind: 'opportunity'; record: Opportunity; changedAt: string };

/**
 * Twenty owns the owner of leads and opportunities (HLD §8). A change applies only when the Core record is not newer
 * and the new owner is still eligible for the product (licence, leave, POSP scope via M02).
 */
@Injectable()
export class TwentyOwnerChange {
  constructor(
    @Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly opportunities: OpportunityRepository,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
    @Inject(POS_ELIGIBILITY) private readonly pos: PosEligibilityPolicy,
    private readonly ctx: CrmContext,
  ) {}

  async apply(tx: Transaction, e: TwentyWebhookEvent): Promise<WebhookOutcome> {
    const owned = await this.load(tx, e);
    if (!owned) return 'unknown_record';
    const memberId = e.record.ownerCoreMemberId;
    const from = owned.record.props.ownerMemberId;
    if (!memberId || memberId === from) return 'unchanged';
    if (e.updatedAt < owned.changedAt) return 'stale';
    const seller = await this.eligibleSeller(tx, memberId, owned.record.props.productInterest);
    if (!seller) return 'ineligible_owner';
    await this.save(tx, owned, memberId, seller.orgUnitId);
    await this.ctx.recorder.record(tx, {
      audit: { action: `crm.${owned.kind}.owner_changed_in_twenty`, entityType: owned.kind, entityId: owned.record.props.id, metadata: { from, to: memberId, source: 'twenty' } },
    });
    return 'applied';
  }

  private async load(tx: Transaction, e: TwentyWebhookEvent): Promise<Owned | undefined> {
    if (e.object === 'lead') {
      const record = await this.leads.get(tx, e.record.coreId);
      return record && { kind: 'lead', record, changedAt: record.props.updatedAt };
    }
    const record = await this.opportunities.get(tx, e.record.coreId);
    return record && { kind: 'opportunity', record, changedAt: record.props.stageEnteredAt };
  }

  private async save(tx: Transaction, owned: Owned, memberId: string, orgUnitId: string): Promise<void> {
    if (owned.kind === 'lead') {
      owned.record.assign(memberId, orgUnitId, undefined, this.ctx.clock.now());
      return this.leads.save(tx, owned.record);
    }
    owned.record.reassign(memberId, orgUnitId);
    return this.opportunities.save(tx, owned.record);
  }

  private async eligibleSeller(tx: Transaction, memberId: string, product: ProductLine) {
    const eligible = await this.sellers.eligibleSellers(tx, { line: lineOfBusiness(product), posEligibleProduct: await this.pos.isPosEligible(product), at: this.ctx.clock.now() });
    return eligible.find((s) => s.memberId === memberId);
  }

}
