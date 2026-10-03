import { LeadProps } from '../domain/lead';
import { OpportunityProps } from '../domain/opportunity';
import { TaskProps } from '../domain/task';
import { PartySummary } from './ports';

export type PremiumBand = '<15k' | '15-30k' | '30-50k' | '>50k';

/** Annual premium band in rupees; Twenty never receives an exact premium (HLD §8). */
export function premiumBand(paise: number): PremiumBand {
  const rupees = paise / 100;
  if (rupees < 15_000) return '<15k';
  if (rupees < 30_000) return '15-30k';
  if (rupees < 50_000) return '30-50k';
  return '>50k';
}

/**
 * Minimised projections to Twenty (HLD §8, AC-M04-22). Allow-lists only: a new Core field never leaks by default.
 * Never projected: date of birth, identity numbers, address or pincode, full contact details, exact premium, qualification answers.
 */
export const TwentyProjector = {
  person(p: PartySummary, canContact: boolean): Record<string, unknown> {
    return {
      core_party_id: p.id, name: p.displayName, phone_masked: p.primaryMobileMasked ?? null, email_masked: p.primaryEmailMasked ?? null,
      language: p.preferredLanguage, can_contact: canContact,
    };
  },

  lead(l: LeadProps): Record<string, unknown> {
    return {
      core_id: l.id, core_party_id: l.partyId, product_interest: l.productInterest, stage: l.stage, temperature: l.temperature,
      source: l.attribution.source, owner_core_member_id: l.ownerMemberId ?? null, sla_due_at: l.slaDueAt ?? null, created_at: l.createdAt,
    };
  },

  opportunity(o: OpportunityProps): Record<string, unknown> {
    return {
      core_id: o.id, core_party_id: o.partyId, title: o.title, product_interest: o.productInterest, stage: o.stage,
      premium_band: premiumBand(o.expectedPremium.paise), owner_core_member_id: o.ownerMemberId,
    };
  },

  task(t: TaskProps): Record<string, unknown> {
    return {
      core_id: t.id, title: t.title, kind: t.kind, due_at: t.dueAt, status: t.status, owner_core_member_id: t.ownerMemberId,
      subject_type: t.subjectType, subject_core_id: t.subjectId,
    };
  },
};
