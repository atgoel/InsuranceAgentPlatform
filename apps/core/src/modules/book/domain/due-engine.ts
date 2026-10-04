import { addDays, daysBetween } from '../../../kernel/domain/ist';
import { HeldPolicyProps } from './held-policy';
import { addMonthsClamped, assertDate, GracePolicy, scheduleFrom } from './premium-schedule';

export type DueStatus = 'UPCOMING' | 'DUE_TODAY' | 'IN_GRACE' | 'LAPSED' | 'REVIVABLE' | 'RENEWAL_DUE' | 'PAID';
export interface DueClassification { status: DueStatus; dueDate?: string; graceEndsOn?: string; revivalEndsOn?: string; daysToDue?: number }
export interface WindowDue { policyId: string; dueDate: string; status: DueStatus; amountPaise: number }
const CLOSED = ['PAID_UP', 'MATURED', 'SURRENDERED', 'CLAIMED', 'EXPIRED', 'CANCELLED'];

export class DueEngine {
  constructor(private readonly grace: GracePolicy) {}
  classify(policy: HeldPolicyProps, today: string): DueClassification {
    assertDate(today);
    if (CLOSED.includes(policy.status) || policy.mode === 'SINGLE') return { status: 'PAID' };
    const due = policy.line === 'LIFE' ? policy.nextDueDate : policy.renewalDate;
    if (!due) return { status: 'PAID' };
    const daysToDue = daysBetween(today, due);
    if (policy.line !== 'LIFE') return annualDue(policy, today, due, daysToDue);
    const graceEndsOn = addDays(due, this.grace.graceDays(policy.mode));
    const revivalEndsOn = addMonthsClamped(due, this.grace.revivalYears * 12);
    let status: DueStatus = 'LAPSED';
    if (today < due) status = 'UPCOMING';
    else if (today === due) status = 'DUE_TODAY';
    else if (today <= graceEndsOn) status = 'IN_GRACE';
    else if (today <= revivalEndsOn) status = 'REVIVABLE';
    return { status, dueDate: due, graceEndsOn, revivalEndsOn, daysToDue };
  }
  window(policies: HeldPolicyProps[], from: string, to: string): WindowDue[] {
    assertDate(from); assertDate(to);
    const result: WindowDue[] = [];
    for (const policy of policies) {
      if (CLOSED.includes(policy.status)) continue;
      for (const installment of scheduleFrom(policy, from, 1200)) {
        if (installment.dueDate > to) break;
        const status: DueStatus = policy.line === 'LIFE' ? 'DUE_TODAY' : 'RENEWAL_DUE';
        result.push({ policyId: policy.id, dueDate: installment.dueDate, status, amountPaise: installment.amountPaise });
      }
    }
    return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.policyId.localeCompare(b.policyId));
  }
}
function annualDue(policy: HeldPolicyProps, today: string, due: string, daysToDue: number): DueClassification {
  const graceEndsOn = addDays(due, policy.line === 'HEALTH' ? 30 : 0);
  let status: DueStatus = 'UPCOMING';
  if (daysToDue <= 45 && daysToDue >= 0) status = 'RENEWAL_DUE';
  else if (today > due) status = today <= graceEndsOn ? 'IN_GRACE' : 'LAPSED';
  return { status, dueDate: due, graceEndsOn, daysToDue };
}
