import { ValidationError } from '../../../kernel/errors/domain-errors';
import type { HeldPolicyProps } from './held-policy';

export const PREMIUM_MODES = ['ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY', 'SINGLE'] as const;
export type PremiumMode = (typeof PREMIUM_MODES)[number];
export interface Installment {
  dueDate: string;
  amountPaise: number;
}
export interface GracePolicy {
  graceDays(mode: PremiumMode): number;
  revivalYears: number;
}
export const LIFE_GRACE: GracePolicy = { graceDays: (mode) => (mode === 'MONTHLY' ? 15 : 30), revivalYears: 5 };
/** Post-renewal grace for annual contracts: health 30 days, general none. */
export function annualGraceDays(line: string): number {
  return line === 'HEALTH' ? 30 : 0;
}
export const MODE_MONTHS: Record<PremiumMode, number> = { ANNUAL: 12, HALF_YEARLY: 6, QUARTERLY: 3, MONTHLY: 1, SINGLE: 0 };

export function assertDate(date: string): void {
  const at = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) {
    throw new ValidationError('invalid_date', 'Expected a real YYYY-MM-DD date');
  }
}

/** UTC is used only to manipulate calendar components; instants are converted with istDate at the boundary. */
export function addMonthsClamped(date: string, months: number, anchorDay = Number(date.slice(8, 10))): string {
  assertDate(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, last))).toISOString().slice(0, 10);
}

export function scheduleFrom(policy: HeldPolicyProps, from: string, count: number): Installment[] {
  assertDate(from);
  if (!Number.isInteger(count) || count < 0 || count > 1200)
    throw new ValidationError('invalid_schedule_count', 'Schedule count must be from 0 to 1200');
  if (policy.mode === 'SINGLE' || count === 0) return [];
  let due = firstDue(policy, from);
  if (due === undefined) return [];
  const months = MODE_MONTHS[policy.mode];
  const anchor = Number((policy.line === 'LIFE' ? policy.commencementDate : due).slice(8, 10));
  const result: Installment[] = [];
  for (let i = 0; i < count; i++) {
    if (pastPayingTerm(policy, due)) break;
    result.push({ dueDate: due, amountPaise: policy.commercials.premiumGrossPaise });
    due = addMonthsClamped(due, months, anchor);
  }
  return result;
}
function firstDue(policy: HeldPolicyProps, from: string): string | undefined {
  let due = policy.line === 'LIFE' ? policy.nextDueDate : policy.renewalDate;
  if (due === undefined) return undefined;
  const months = MODE_MONTHS[policy.mode];
  const anchor = Number((policy.line === 'LIFE' ? policy.commencementDate : due).slice(8, 10));
  // Bounded jump followed by correction avoids a loop over arbitrarily old dates.
  const gap = (Number(from.slice(0, 4)) - Number(due.slice(0, 4))) * 12 + Number(from.slice(5, 7)) - Number(due.slice(5, 7));
  if (gap > months) due = addMonthsClamped(due, Math.floor(gap / months) * months, anchor);
  while (due < from) due = addMonthsClamped(due, months, anchor);
  return due;
}
function pastPayingTerm(policy: HeldPolicyProps, due: string): boolean {
  if (policy.maturityDate !== undefined && due >= policy.maturityDate) return true;
  return (
    policy.premiumPayingTermYears !== undefined && due >= addMonthsClamped(policy.commencementDate, policy.premiumPayingTermYears * 12)
  );
}
