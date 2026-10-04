import { addDays } from '../../../kernel/domain/ist';
import { HeldPolicyProps } from './held-policy';
import { addMonthsClamped, assertDate } from './premium-schedule';

export type LifecycleKind = 'MATURITY' | 'SURVIVAL_BENEFIT' | 'ANNIVERSARY' | 'FREE_LOOK_END' | 'AGE_CHANGE' | 'BIRTHDAY';
export interface LifecycleParty { id: string; dobYear?: number; birthday?: string }
export interface LifecycleAlert { policyId: string; kind: LifecycleKind; date: string; key: string }
export interface LifecycleAlertRule {
  readonly kind: LifecycleKind;
  occursOn(policy: HeldPolicyProps, parties: readonly LifecycleParty[], year: number): string | undefined;
}
function inYear(date: string | undefined, year: number): string | undefined { return date?.startsWith(String(year)) ? date : undefined; }
function anniversary(date: string, year: number): string { return addMonthsClamped(date, (year - Number(date.slice(0, 4))) * 12); }
function birthday(party: LifecycleParty | undefined, year: number): string | undefined {
  if (!party?.birthday) return undefined;
  const date = `${year}-${party.birthday}`;
  if (party.birthday === '02-29') return anniversary('2000-02-29', year);
  assertDate(date);
  return date;
}
export class MaturityRule implements LifecycleAlertRule {
  readonly kind = 'MATURITY' as const;
  occursOn(policy: HeldPolicyProps, _parties: readonly LifecycleParty[], year: number): string | undefined { return inYear(policy.maturityDate, year); }
}
export class SurvivalBenefitRule implements LifecycleAlertRule {
  readonly kind = 'SURVIVAL_BENEFIT' as const;
  constructor(private readonly yearsFor: (policy: HeldPolicyProps) => readonly number[] = () => []) {}
  occursOn(policy: HeldPolicyProps, _parties: readonly LifecycleParty[], year: number): string | undefined {
    const age = year - Number(policy.commencementDate.slice(0, 4));
    return this.yearsFor(policy).includes(age) ? anniversary(policy.commencementDate, year) : undefined;
  }
}
export class AnniversaryRule implements LifecycleAlertRule {
  readonly kind = 'ANNIVERSARY' as const;
  occursOn(policy: HeldPolicyProps, _parties: readonly LifecycleParty[], year: number): string | undefined {
    return year > Number(policy.commencementDate.slice(0, 4)) ? anniversary(policy.commencementDate, year) : undefined;
  }
}
export class FreeLookEndRule implements LifecycleAlertRule {
  readonly kind = 'FREE_LOOK_END' as const;
  occursOn(policy: HeldPolicyProps, _parties: readonly LifecycleParty[], year: number): string | undefined {
    return inYear(addDays(policy.commencementDate, policy.source === 'PLATFORM_SALE' || policy.distanceSale ? 30 : 15), year);
  }
}
export class AgeChangeRule implements LifecycleAlertRule {
  readonly kind = 'AGE_CHANGE' as const;
  occursOn(policy: HeldPolicyProps, parties: readonly LifecycleParty[], year: number): string | undefined {
    const party = parties.find((p) => p.id === policy.proposerPartyId);
    if (party?.dobYear === undefined) return undefined;
    for (const birthdayYear of [year, year + 1]) {
      const day = birthday(party, birthdayYear);
      if (day && birthdayYear > party.dobYear) {
        const change = addMonthsClamped(day, -6);
        if (inYear(change, year)) return change;
      }
    }
    return undefined;
  }
}
export class BirthdayRule implements LifecycleAlertRule {
  readonly kind = 'BIRTHDAY' as const;
  occursOn(policy: HeldPolicyProps, parties: readonly LifecycleParty[], year: number): string | undefined { return birthday(parties.find((p) => p.id === policy.proposerPartyId), year); }
}
export class LifecycleAlertEngine {
  constructor(private readonly rules: readonly LifecycleAlertRule[] = [new MaturityRule(), new SurvivalBenefitRule(), new AnniversaryRule(), new FreeLookEndRule(), new AgeChangeRule(), new BirthdayRule()]) {}
  alertsBetween(policies: readonly HeldPolicyProps[], parties: readonly LifecycleParty[], from: string, to: string): LifecycleAlert[] {
    assertDate(from); assertDate(to);
    const result = new Map<string, LifecycleAlert>();
    for (const policy of policies) {
      for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)) + 1; year++) {
        for (const alert of this.alertsInYear(policy, parties, year, { from, to })) result.set(alert.key, alert);
      }
    }
    return [...result.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  }
  private alertsInYear(policy: HeldPolicyProps, parties: readonly LifecycleParty[], year: number, window: { from: string; to: string }): LifecycleAlert[] {
    return this.rules.flatMap((rule) => {
      const date = rule.occursOn(policy, parties, year);
      if (!date) return [];
      const dates = rule.kind === 'MATURITY' ? [addDays(date, -90), addDays(date, -30)] : [date];
      return dates.filter((day) => day >= window.from && day <= window.to).map((day) => ({ policyId: policy.id, kind: rule.kind, date: day, key: `${policy.id}:${rule.kind}:${day}` }));
    });
  }
}
