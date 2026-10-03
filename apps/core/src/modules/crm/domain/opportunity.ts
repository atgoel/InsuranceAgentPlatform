import { BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { Money } from '../../../kernel/domain';
import type { ProductLine, LostReason, Attribution } from './lead';

export type OpportunityStage = 'DISCOVERY' | 'QUOTE_SHARED' | 'PROPOSAL_COMPLETE' | 'INSURER_PENDING' | 'ISSUED' | 'LOST';

export interface OpportunityProps {
  id: string;
  partyId: string;
  leadId?: string;
  productInterest: ProductLine;
  title: string;
  expectedPremium: Money;
  stage: OpportunityStage;
  ownerMemberId: string;
  orgUnitId?: string;
  attribution?: Attribution;
  insurerName?: string;
  lostReason?: LostReason;
  issuedPolicySaleId?: string;
  stageEnteredAt: string;
  createdAt: string;
  version: number;
}

export class Opportunity {
  private _props: OpportunityProps;

  static open(input: {
    id: string;
    partyId: string;
    leadId?: string;
    productInterest: ProductLine;
    title: string;
    expectedPremium: Money;
    startStage: 'DISCOVERY' | 'QUOTE_SHARED';
    ownerMemberId: string;
    orgUnitId?: string;
    attribution?: Attribution;
    now: Date;
  }): Opportunity {
    const now = input.now.toISOString();
    return new Opportunity({
      id: input.id,
      partyId: input.partyId,
      leadId: input.leadId,
      productInterest: input.productInterest,
      title: input.title,
      expectedPremium: input.expectedPremium,
      stage: input.startStage,
      ownerMemberId: input.ownerMemberId,
      orgUnitId: input.orgUnitId,
      attribution: input.attribution,
      stageEnteredAt: now,
      createdAt: now,
      version: 1,
    });
  }

  static restore(props: OpportunityProps): Opportunity {
    return new Opportunity(props);
  }

  private constructor(props: OpportunityProps) {
    this._props = props;
  }

  markSaved(): void {
    this._props = { ...this._props, version: this._props.version + 1 };
  }

  get props(): Readonly<OpportunityProps> {
    return this._props;
  }

  move(to: OpportunityStage, now: Date): void {
    // Terminal stages cannot move
    if (this._props.stage === 'ISSUED' || this._props.stage === 'LOST') {
      throw new BusinessRuleError('opportunity_closed', `Cannot move from terminal stage ${this._props.stage}`);
    }

    // Cannot move to ISSUED via move - use markIssued
    if (to === 'ISSUED') {
      throw new BusinessRuleError('issued_requires_insurer_confirmation', 'Use markIssued for insurer confirmation');
    }

    // Cannot move to LOST via move - use markLost
    if (to === 'LOST') {
      throw new BusinessRuleError('use_mark_lost', 'Use markLost to mark opportunity as lost');
    }

    // Define adjacency: each stage can move to adjacent stages (forward and back one step)
    const adjacencyMap: Record<string, string[]> = {
      DISCOVERY: ['QUOTE_SHARED'],
      QUOTE_SHARED: ['DISCOVERY', 'PROPOSAL_COMPLETE'],
      PROPOSAL_COMPLETE: ['QUOTE_SHARED', 'INSURER_PENDING'],
      INSURER_PENDING: ['PROPOSAL_COMPLETE'],
    };

    const adjacent = adjacencyMap[this._props.stage] || [];
    if (!adjacent.includes(to)) {
      throw new BusinessRuleError('illegal_opportunity_transition', `Cannot move from ${this._props.stage} to ${to}`);
    }

    this._props.stage = to;
    this._props.stageEnteredAt = now.toISOString();
  }

  markLost(reason: LostReason, now: Date): void {
    if (this._props.stage === 'ISSUED' || this._props.stage === 'LOST') {
      throw new BusinessRuleError('opportunity_closed', `Cannot mark lost from ${this._props.stage}`);
    }

    this._props.stage = 'LOST';
    this._props.lostReason = reason;
    this._props.stageEnteredAt = now.toISOString();
  }

  markIssued(input: { policySaleId: string; confirmedBy: 'INSURER' }, now: Date): void {
    if (this._props.stage !== 'INSURER_PENDING' && this._props.stage !== 'PROPOSAL_COMPLETE') {
      throw new BusinessRuleError('issued_invalid_stage', `Can only issue from INSURER_PENDING or PROPOSAL_COMPLETE`);
    }

    this._props.stage = 'ISSUED';
    this._props.issuedPolicySaleId = input.policySaleId;
    this._props.stageEnteredAt = now.toISOString();
  }

  updateExpectedPremium(m: Money): void {
    this._props.expectedPremium = m;
  }

  ageInStageDays(now: Date): number {
    const entered = new Date(this._props.stageEnteredAt);
    const diffMs = now.getTime() - entered.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
