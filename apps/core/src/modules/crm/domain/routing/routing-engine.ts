import { conditionSpec, type RoutingRule, type LeadRoutingFacts } from './routing-rule';
import type { RoutingStrategy, RoutingCandidate as RoutingCandidateBase } from './strategies';

// Re-export these types so specs importing from routing-engine work
export type { LeadRoutingFacts, RoutingRule };
export type RoutingCandidate = RoutingCandidateBase;

export interface RoutingDecision {
  memberId?: string;
  orgUnitId?: string;
  ruleId?: string;
  slaMinutes?: number;
  reason: string; // human readable, shown in "Test a lead"
  skipped: Array<{ memberId: string; reason: string }>;
}

export class RoutingEngine {
  private strategiesByMethod: Map<string, RoutingStrategy>;

  constructor(strategies: RoutingStrategy[]) {
    this.strategiesByMethod = new Map();
    for (const strategy of strategies) {
      this.strategiesByMethod.set(strategy.method, strategy);
    }
  }

  /** First active rule (by priority) whose conditions match and whose pool yields a pick wins. */
  async route(input: RouteInput): Promise<RoutingDecision> {
    const skipped: Array<{ memberId: string; reason: string }> = [];
    const rules = input.rules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);
    for (const rule of rules) {
      if (!conditionSpec(rule.conditions).isSatisfiedBy(input.facts)) continue;
      const decision = await this.tryRule(rule, input, skipped);
      if (decision) return decision;
    }
    return { reason: UNASSIGNED_REASON, skipped };
  }

  private async tryRule(rule: RoutingRule, input: RouteInput, skipped: RoutingDecision['skipped']): Promise<RoutingDecision | undefined> {
    const strategy = this.strategiesByMethod.get(rule.method);
    if (!strategy) return undefined;
    const eligible = withinCapacity(rule, await input.candidatesFor(rule), skipped);
    if (eligible.length === 0) return undefined;
    const picked = strategy.pick(eligible, input.facts, { lastMemberId: await input.cursorFor(rule.id) });
    if (!picked) return undefined;
    return {
      memberId: picked.memberId,
      orgUnitId: picked.orgUnitId, // the owner's unit drives record scope
      ruleId: rule.id,
      slaMinutes: rule.slaMinutes,
      reason: `Rule "${rule.name}" (${rule.method.toLowerCase().replace('_', ' ')}) → ${picked.displayName}`,
      skipped,
    };
  }
}

const UNASSIGNED_REASON = 'No eligible salesperson — sent to the unassigned queue';

interface RouteInput {
  rules: RoutingRule[];
  facts: LeadRoutingFacts;
  candidatesFor(rule: RoutingRule): Promise<RoutingCandidate[]>;
  cursorFor(ruleId: string): Promise<string | undefined>;
}

/** Capacity: openLeadsToday must stay below the rule's per-person cap, else the seller's own daily capacity. */
function withinCapacity(rule: RoutingRule, candidates: RoutingCandidate[], skipped: RoutingDecision['skipped']): RoutingCandidate[] {
  return candidates.filter((c) => {
    const limit = rule.capacityPerPerson ?? c.capacityPerDay;
    if (c.openLeadsToday < limit) return true;
    skipped.push({ memberId: c.memberId, reason: `At capacity (${c.openLeadsToday}/${limit} leads today)` });
    return false;
  });
}
