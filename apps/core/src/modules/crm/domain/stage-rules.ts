import type { Activity } from './activity';
import type { LeadProps, LeadStage } from './lead';

export interface StageRuleContext {
  activities: Activity[];
  lead: LeadProps;
  consentRecorded: boolean;
}

export interface StageEntryRule {
  readonly id: string;
  readonly label: string;
  isSatisfiedBy(ctx: StageRuleContext): boolean;
}

export const HasConnectedContact: StageEntryRule = {
  id: 'has_connected_contact',
  label: 'Log a connected call, meeting or message',
  isSatisfiedBy(ctx: StageRuleContext): boolean {
    for (const activity of ctx.activities) {
      // CALL with CONNECTED outcome
      if (activity.kind === 'CALL' && activity.outcome === 'CONNECTED') {
        return true;
      }
      // MEETING
      if (activity.kind === 'MEETING') {
        return true;
      }
      // WHATSAPP or EMAIL by owner
      if ((activity.kind === 'WHATSAPP' || activity.kind === 'EMAIL') && activity.actorMemberId === ctx.lead.ownerMemberId) {
        return true;
      }
    }
    return false;
  },
};

export const HasQualification: StageEntryRule = {
  id: 'has_qualification',
  label: 'Complete qualification (need, budget, timeline)',
  isSatisfiedBy(ctx: StageRuleContext): boolean {
    const q = ctx.lead.qualification;
    return !!q.need && !!q.budgetBand && !!q.timeline;
  },
};

export const HasConsent: StageEntryRule = {
  id: 'has_consent',
  label: 'Record consent to contact',
  isSatisfiedBy(ctx: StageRuleContext): boolean {
    return ctx.consentRecorded;
  },
};

export class StageRuleSet {
  private rules: Map<LeadStage, StageEntryRule[]>;

  constructor(rules: Partial<Record<LeadStage, StageEntryRule[]>> = {}) {
    this.rules = new Map(Object.entries(rules) as [LeadStage, StageEntryRule[]][]);
  }

  static defaults(): StageRuleSet {
    return new StageRuleSet({
      CONTACTED: [HasConnectedContact],
      QUALIFIED: [HasConnectedContact, HasQualification, HasConsent],
    });
  }

  missingFor(stage: LeadStage, ctx: StageRuleContext): string[] {
    const stageRules = this.rules.get(stage) || [];
    return stageRules.filter(rule => !rule.isSatisfiedBy(ctx)).map(rule => rule.label);
  }
}
