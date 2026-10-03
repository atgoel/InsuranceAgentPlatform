import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import type { StageRuleSet, StageRuleContext } from './stage-rules';

export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';
export type LeadSource =
  | 'WEB_FORM'
  | 'MICROSITE'
  | 'REFERRAL'
  | 'WALK_IN'
  | 'PHONE'
  | 'EVENT'
  | 'CAMPAIGN'
  | 'IMPORT'
  | 'API';
export type ProductLine =
  | 'TERM_LIFE'
  | 'SAVINGS_LIFE'
  | 'HEALTH'
  | 'HEALTH_FLOATER'
  | 'CHILD'
  | 'RETIREMENT'
  | 'MOTOR'
  | 'OTHER';
export type Temperature = 'HOT' | 'WARM' | 'COLD';
export type LostReason =
  | 'BOUGHT_ELSEWHERE'
  | 'PREMIUM_TOO_HIGH'
  | 'DECLINED_BY_UNDERWRITING'
  | 'NOT_REACHABLE'
  | 'POSTPONED'
  | 'NOT_INTERESTED'
  | 'OTHER';

export interface Qualification {
  need?: 'PROTECTION' | 'TAX_SAVING' | 'CHILD_EDUCATION' | 'RETIREMENT' | 'HEALTH_COVER' | 'VEHICLE';
  budgetBand?: 'LT_15K' | '15K_30K' | 'GT_30K';
  timeline?: 'THIS_MONTH' | '1_3_MONTHS' | 'EXPLORING';
  existingCover?: string; // ≤ 200 chars, no P3
}

export interface Touch {
  channel: string;
  ref?: string;
  at: string;
}

export interface Attribution {
  source: LeadSource;
  campaignId?: string;
  firstTouch: Touch;
  lastTouch: Touch;
  referrerPartyId?: string;
  micrositeMemberId?: string;
}

export interface StageHistoryEntry {
  from?: LeadStage;
  to: LeadStage;
  at: string;
  by: string;
}

export interface LeadProps {
  id: string;
  partyId: string;
  productInterest: ProductLine;
  pincode?: string;
  language?: string;
  stage: LeadStage;
  temperature: Temperature;
  ownerMemberId?: string;
  orgUnitId?: string;
  routedByRuleId?: string;
  attribution: Attribution;
  qualification: Qualification;
  lostReason?: LostReason;
  slaDueAt?: string;
  firstRespondedAt?: string;
  /** Set when crm.lead.sla_breached was announced, so the sweep announces each breach once. */
  slaBreachNotifiedAt?: string;
  stageHistory: StageHistoryEntry[];
  convertedOpportunityId?: string;
  syncState: 'synced' | 'pending' | 'failed' | 'local';
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export function lineOfBusiness(p: ProductLine): 'LIFE' | 'HEALTH' | 'GENERAL' {
  switch (p) {
    case 'TERM_LIFE':
    case 'SAVINGS_LIFE':
    case 'CHILD':
    case 'RETIREMENT':
      return 'LIFE';
    case 'HEALTH':
    case 'HEALTH_FLOATER':
      return 'HEALTH';
    case 'MOTOR':
    case 'OTHER':
      return 'GENERAL';
  }
}

export class Lead {
  private _props: LeadProps;

  static capture(input: {
    id: string;
    partyId: string;
    productInterest: ProductLine;
    attribution: Attribution;
    pincode?: string;
    language?: string;
    now: Date;
    by: string;
  }): Lead {
    if (input.pincode && !/^[1-9][0-9]{5}$/.test(input.pincode)) {
      throw new ValidationError('invalid_pincode', 'Pincode must be 6 digits starting with 1-9');
    }

    const now = input.now.toISOString();
    return new Lead({
      id: input.id,
      partyId: input.partyId,
      productInterest: input.productInterest,
      pincode: input.pincode,
      language: input.language,
      stage: 'NEW',
      temperature: 'WARM',
      attribution: input.attribution,
      qualification: {},
      stageHistory: [{ to: 'NEW', at: now, by: input.by }],
      syncState: 'local',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  }

  static restore(props: LeadProps): Lead {
    return new Lead(props);
  }

  private constructor(props: LeadProps) {
    this._props = props;
  }

  markSaved(): void {
    this._props = { ...this._props, version: this._props.version + 1 };
  }

  get props(): Readonly<LeadProps> {
    return this._props;
  }

  // eslint-disable-next-line max-params
  assign(memberId: string, orgUnitId: string, slaMinutes: number | undefined, now: Date, ruleId?: string): void {
    this._props.ownerMemberId = memberId;
    this._props.orgUnitId = orgUnitId;
    this._props.routedByRuleId = ruleId;

    if (slaMinutes !== undefined && !this._props.firstRespondedAt) {
      const due = new Date(now);
      due.setMinutes(due.getMinutes() + slaMinutes);
      this._props.slaDueAt = due.toISOString();
      this._props.slaBreachNotifiedAt = undefined; // a new SLA clock can breach (and be announced) again
    }

    this._props.updatedAt = now.toISOString();
  }

  markSlaBreachNotified(now: Date): void {
    this._props.slaBreachNotifiedAt = now.toISOString();
  }

  unassign(): void {
    this._props.ownerMemberId = undefined;
    this._props.orgUnitId = undefined;
    this._props.routedByRuleId = undefined;
    this._props.slaDueAt = undefined;
  }

  recordResponse(now: Date): void {
    if (!this._props.firstRespondedAt) {
      this._props.firstRespondedAt = now.toISOString();
    }
  }

  slaState(now: Date): 'met' | 'breached' | 'pending' | 'none' {
    if (!this._props.slaDueAt) return 'none';

    const due = new Date(this._props.slaDueAt);
    const responded = this._props.firstRespondedAt ? new Date(this._props.firstRespondedAt) : null;

    if (responded) {
      return responded <= due ? 'met' : 'breached';
    }

    return now > due ? 'breached' : 'pending';
  }

  qualify(q: Qualification): void {
    this._props.qualification = q;
  }

  // eslint-disable-next-line max-params
  moveTo(stage: LeadStage, rules: StageRuleSet, ctx: StageRuleContext, now: Date, by: string, lostReason?: LostReason): void {
    // Check terminal states
    if (this._props.stage === 'CONVERTED' || this._props.stage === 'LOST') {
      throw new BusinessRuleError('lead_closed', `Cannot move from terminal stage ${this._props.stage}`);
    }

    // Check if trying to move to CONVERTED via moveTo
    if (stage === 'CONVERTED') {
      throw new BusinessRuleError('use_conversion', 'Use markConverted for conversion');
    }

    // Validate legal transitions
    const legal: Record<LeadStage, LeadStage[]> = {
      NEW: ['CONTACTED', 'LOST'],
      CONTACTED: ['QUALIFIED', 'LOST', 'NEW'],
      QUALIFIED: ['CONTACTED', 'LOST'],
      CONVERTED: [],
      LOST: [],
    };

    if (!legal[this._props.stage]?.includes(stage)) {
      throw new BusinessRuleError('illegal_lead_transition', `Cannot move from ${this._props.stage} to ${stage}`);
    }

    // LOST requires reason
    if (stage === 'LOST' && !lostReason) {
      throw new ValidationError('lost_reason_required', 'Lost stage requires a reason');
    }

    // Check stage rules
    const missing = rules.missingFor(stage, ctx);
    if (missing.length > 0) {
      throw new BusinessRuleError('stage_rule_failed', `Missing rules for ${stage}`, { to: stage, missing });
    }

    this._props.stageHistory.push({
      from: this._props.stage,
      to: stage,
      at: now.toISOString(),
      by,
    });

    this._props.stage = stage;
    if (stage === 'LOST') {
      this._props.lostReason = lostReason;
    }
    this._props.updatedAt = now.toISOString();
  }

  markConverted(opportunityId: string, now: Date, by: string): void {
    if (this._props.stage !== 'QUALIFIED') {
      throw new BusinessRuleError('lead_not_qualified', `Cannot convert lead in ${this._props.stage} stage`);
    }

    this._props.stageHistory.push({
      from: 'QUALIFIED',
      to: 'CONVERTED',
      at: now.toISOString(),
      by,
    });

    this._props.stage = 'CONVERTED';
    this._props.convertedOpportunityId = opportunityId;
    this._props.updatedAt = now.toISOString();
  }

  setTemperature(t: Temperature): void {
    this._props.temperature = t;
  }

  relinkParty(partyId: string): void {
    this._props.partyId = partyId;
  }

  touch(t: Touch): void {
    this._props.attribution.lastTouch = t;
  }
}
