import type { LeadRoutingFacts } from './routing-rule';

export type RoutingMethod = 'ROUND_ROBIN' | 'LEAST_LOADED' | 'TERRITORY' | 'SKILL' | 'DIRECT_OWNER';

export interface RoutingCandidate {
  memberId: string;
  displayName: string;
  orgUnitId: string;
  salespersonType: string; // 'EMPLOYEE' | 'ISP' | 'POSP' | 'SOLO'
  capacityPerDay: number;
  skills: string[];
  languages: string[];
  openLeadsToday: number;
  territoryCodes?: string[]; // org unit codes that define territory
}

export interface RoutingStrategy {
  readonly method: RoutingMethod;
  pick(candidates: RoutingCandidate[], facts: LeadRoutingFacts, state: { lastMemberId?: string }): RoutingCandidate | undefined;
}

export class RoundRobinStrategy implements RoutingStrategy {
  readonly method = 'ROUND_ROBIN' as const;

  pick(candidates: RoutingCandidate[], _facts: LeadRoutingFacts, state: { lastMemberId?: string }): RoutingCandidate | undefined {
    if (candidates.length === 0) return undefined;

    // Sort candidates by memberId for stable order
    const sorted = [...candidates].sort((a, b) => a.memberId.localeCompare(b.memberId));

    if (!state.lastMemberId) {
      return sorted[0];
    }

    // Find the index of lastMemberId
    const lastIdx = sorted.findIndex(c => c.memberId === state.lastMemberId);

    // If not found, return first
    if (lastIdx === -1) {
      return sorted[0];
    }

    // Return next after lastIdx, wrapping around
    return sorted[(lastIdx + 1) % sorted.length];
  }
}

export class LeastLoadedStrategy implements RoutingStrategy {
  readonly method = 'LEAST_LOADED' as const;

  pick(candidates: RoutingCandidate[], _facts: LeadRoutingFacts, _state: { lastMemberId?: string }): RoutingCandidate | undefined {
    if (candidates.length === 0) return undefined;

    // Calculate load ratio for each candidate
    let bestCandidate = candidates[0];
    let bestRatio = bestCandidate.openLeadsToday / bestCandidate.capacityPerDay;

    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const ratio = candidate.openLeadsToday / candidate.capacityPerDay;

      if (ratio < bestRatio || (ratio === bestRatio && candidate.memberId < bestCandidate.memberId)) {
        bestCandidate = candidate;
        bestRatio = ratio;
      }
    }

    return bestCandidate;
  }
}

export class TerritoryStrategy implements RoutingStrategy {
  readonly method = 'TERRITORY' as const;

  pick(candidates: RoutingCandidate[], facts: LeadRoutingFacts, state: { lastMemberId?: string }): RoutingCandidate | undefined {
    if (candidates.length === 0) return undefined;

    if (!facts.pincode) {
      // No pincode: round-robin among all candidates
      return this.roundRobinPick(candidates, state.lastMemberId);
    }

    // Filter candidates whose territoryCodes contain the pincode prefix
    const matching = candidates.filter(c => {
      if (!c.territoryCodes) return false;
      return c.territoryCodes.some(code => facts.pincode!.startsWith(code));
    });

    if (matching.length > 0) {
      // Round-robin among matching candidates
      return this.roundRobinPick(matching, state.lastMemberId);
    }

    // No matching: round-robin among all candidates
    return this.roundRobinPick(candidates, state.lastMemberId);
  }

  private roundRobinPick(candidates: RoutingCandidate[], lastMemberId?: string): RoutingCandidate | undefined {
    if (candidates.length === 0) return undefined;

    const sorted = [...candidates].sort((a, b) => a.memberId.localeCompare(b.memberId));

    if (!lastMemberId) {
      return sorted[0];
    }

    const lastIdx = sorted.findIndex(c => c.memberId === lastMemberId);
    if (lastIdx === -1) {
      return sorted[0];
    }

    return sorted[(lastIdx + 1) % sorted.length];
  }
}

export class SkillStrategy implements RoutingStrategy {
  readonly method = 'SKILL' as const;

  pick(candidates: RoutingCandidate[], facts: LeadRoutingFacts, _state: { lastMemberId?: string }): RoutingCandidate | undefined {
    if (candidates.length === 0) return undefined;

    // Filter candidates with the required skill
    const withSkill = candidates.filter(c => c.skills.includes(facts.line));

    if (withSkill.length > 0) {
      // Among those with skill, pick least loaded
      return this.leastLoaded(withSkill);
    }

    // No candidates with skill: pick least loaded among all
    return this.leastLoaded(candidates);
  }

  private leastLoaded(candidates: RoutingCandidate[]): RoutingCandidate | undefined {
    if (candidates.length === 0) return undefined;

    let best = candidates[0];
    let bestRatio = best.openLeadsToday / best.capacityPerDay;

    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const ratio = candidate.openLeadsToday / candidate.capacityPerDay;

      if (ratio < bestRatio || (ratio === bestRatio && candidate.memberId < best.memberId)) {
        best = candidate;
        bestRatio = ratio;
      }
    }

    return best;
  }
}

export class DirectOwnerStrategy implements RoutingStrategy {
  readonly method = 'DIRECT_OWNER' as const;

  pick(candidates: RoutingCandidate[], facts: LeadRoutingFacts, _state: { lastMemberId?: string }): RoutingCandidate | undefined {
    if (!facts.micrositeMemberId) return undefined;

    // Find the candidate with micrositeMemberId
    return candidates.find(c => c.memberId === facts.micrositeMemberId);
  }
}
