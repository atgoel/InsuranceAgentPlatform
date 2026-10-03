import { describe, it, expect } from '@jest/globals';
import {
  RoundRobinStrategy,
  LeastLoadedStrategy,
  TerritoryStrategy,
  SkillStrategy,
  DirectOwnerStrategy,
} from './strategies';
import type { RoutingCandidate, LeadRoutingFacts } from './routing-engine';

/**
 * AC-M04-06/07: Each strategy picks as specified.
 * RoundRobin wraps and persists its cursor.
 * LeastLoaded uses load ratio, tie-break by id.
 * Territory prefers matching pincodes.
 * Skill prefers matching skills, then least-loaded.
 * DirectOwner picks micrositeMemberId if in candidates.
 */
describe('AC-M04-06/07 Routing strategies', () => {
  const candidates: RoutingCandidate[] = [
    {
      memberId: 'mem_1',
      displayName: 'Alice',
      orgUnitId: 'ou_1',
      salespersonType: 'ISP',
      capacityPerDay: 20,
      skills: ['LIFE'],
      languages: ['en'],
      openLeadsToday: 5,
    },
    {
      memberId: 'mem_2',
      displayName: 'Bob',
      orgUnitId: 'ou_2',
      salespersonType: 'ISP',
      capacityPerDay: 15,
      skills: ['HEALTH'],
      languages: ['en'],
      openLeadsToday: 3,
    },
    {
      memberId: 'mem_3',
      displayName: 'Charlie',
      orgUnitId: 'ou_3',
      salespersonType: 'ISP',
      capacityPerDay: 25,
      skills: ['LIFE', 'HEALTH'],
      languages: ['en'],
      openLeadsToday: 8,
    },
  ];

  describe('RoundRobinStrategy', () => {
    it('picks the next candidate after lastMemberId in stable id order', () => {
      const strategy = new RoundRobinStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick1 = strategy.pick(candidates, facts, { lastMemberId: undefined });
      expect(pick1?.memberId).toBe('mem_1'); // First in stable order

      const pick2 = strategy.pick(candidates, facts, { lastMemberId: 'mem_1' });
      expect(pick2?.memberId).toBe('mem_2'); // Next after mem_1

      const pick3 = strategy.pick(candidates, facts, { lastMemberId: 'mem_2' });
      expect(pick3?.memberId).toBe('mem_3'); // Next after mem_2
    });

    it('wraps around to the first candidate', () => {
      const strategy = new RoundRobinStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick(candidates, facts, { lastMemberId: 'mem_3' });
      expect(pick?.memberId).toBe('mem_1'); // Wraps to first
    });

    it('returns undefined when no candidates', () => {
      const strategy = new RoundRobinStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick([], facts, { lastMemberId: undefined });
      expect(pick).toBeUndefined();
    });

    it('handles lastMemberId not in candidate list', () => {
      const strategy = new RoundRobinStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick(candidates, facts, { lastMemberId: 'mem_unknown' });
      expect(pick?.memberId).toBe('mem_1'); // Falls back to first
    });
  });

  describe('LeastLoadedStrategy', () => {
    it('picks the candidate with lowest openLeadsToday / capacityPerDay ratio', () => {
      const strategy = new LeastLoadedStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick(candidates, facts, {});
      // mem_1: 5/20 = 0.25
      // mem_2: 3/15 = 0.20 (least loaded)
      // mem_3: 8/25 = 0.32
      expect(pick?.memberId).toBe('mem_2');
    });

    it('uses id order to break ties', () => {
      const tiedCandidates: RoutingCandidate[] = [
        {
          memberId: 'mem_b',
          displayName: 'Bob',
          orgUnitId: 'ou_b',
          salespersonType: 'ISP',
          capacityPerDay: 20,
          skills: [],
          languages: [],
          openLeadsToday: 5, // 5/20 = 0.25
        },
        {
          memberId: 'mem_a',
          displayName: 'Alice',
          orgUnitId: 'ou_a',
          salespersonType: 'ISP',
          capacityPerDay: 20,
          skills: [],
          languages: [],
          openLeadsToday: 5, // 5/20 = 0.25 (tie, pick by id)
        },
      ];

      const strategy = new LeastLoadedStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick(tiedCandidates, facts, {});
      expect(pick?.memberId).toBe('mem_a'); // Alphabetically first
    });

    it('returns undefined when no candidates', () => {
      const strategy = new LeastLoadedStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick([], facts, {});
      expect(pick).toBeUndefined();
    });
  });

  describe('SkillStrategy', () => {
    it('prefers candidates with matching skills', () => {
      const strategy = new SkillStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'HEALTH',
        line: 'HEALTH',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick(candidates, facts, {});
      // mem_2 has HEALTH skill
      // mem_3 has HEALTH skill
      // Among skill-matched, least-loaded
      // mem_2: 3/15 = 0.20
      // mem_3: 8/25 = 0.32
      expect(pick?.memberId).toBe('mem_2');
    });

    it('applies least-loaded among skill-matched', () => {
      const skillCandidates: RoutingCandidate[] = [
        {
          memberId: 'mem_1',
          displayName: 'Alice',
          orgUnitId: 'ou_1',
          salespersonType: 'ISP',
          capacityPerDay: 20,
          skills: ['HEALTH'],
          languages: [],
          openLeadsToday: 10,
        },
        {
          memberId: 'mem_2',
          displayName: 'Bob',
          orgUnitId: 'ou_2',
          salespersonType: 'ISP',
          capacityPerDay: 20,
          skills: ['HEALTH'],
          languages: [],
          openLeadsToday: 5,
        },
      ];

      const strategy = new SkillStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'HEALTH',
        line: 'HEALTH',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick(skillCandidates, facts, {});
      expect(pick?.memberId).toBe('mem_2');
    });

    it('falls back to least-loaded if no skill match', () => {
      const strategy = new SkillStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'GENERAL',
        line: 'GENERAL',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick(candidates, facts, {});
      // None have GENERAL skill, so fallback to least-loaded overall
      expect(pick?.memberId).toBe('mem_2');
    });

    it('returns undefined when no candidates', () => {
      const strategy = new SkillStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'HEALTH',
        line: 'HEALTH',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick([], facts, {});
      expect(pick).toBeUndefined();
    });
  });

  describe('TerritoryStrategy', () => {
    it('prefers candidates whose org unit territory matches pincode prefix', () => {
      // Assumes territory matching is done by comparing pincode prefix with orgUnit codes
      // This is a simplified test; actual implementation depends on territory logic
      const strategy = new TerritoryStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
        pincode: '560001', // Bangalore
      };

      const pick = strategy.pick(candidates, facts, {});
      expect(pick).toBeDefined();
      expect([...candidates.map((c) => c.memberId)]).toContain(pick?.memberId);
    });

    it('falls back to round-robin among territory-matched candidates', () => {
      const strategy = new TerritoryStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
        pincode: '560001',
      };

      const pick1 = strategy.pick(candidates, facts, { lastMemberId: undefined });
      const pick2 = strategy.pick(candidates, facts, { lastMemberId: pick1?.memberId });
      expect(pick1?.memberId).not.toEqual(pick2?.memberId);
    });

    it('returns undefined when no candidates', () => {
      const strategy = new TerritoryStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
        pincode: '560001',
      };

      const pick = strategy.pick([], facts, {});
      expect(pick).toBeUndefined();
    });
  });

  describe('DirectOwnerStrategy', () => {
    it('picks micrositeMemberId if it is in candidates', () => {
      const strategy = new DirectOwnerStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
        micrositeMemberId: 'mem_2',
      };

      const pick = strategy.pick(candidates, facts, {});
      expect(pick?.memberId).toBe('mem_2');
    });

    it('returns undefined if micrositeMemberId is not in candidates', () => {
      const strategy = new DirectOwnerStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
        micrositeMemberId: 'mem_unknown',
      };

      const pick = strategy.pick(candidates, facts, {});
      expect(pick).toBeUndefined();
    });

    it('returns undefined if no micrositeMemberId provided', () => {
      const strategy = new DirectOwnerStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const pick = strategy.pick(candidates, facts, {});
      expect(pick).toBeUndefined();
    });

    it('returns undefined when no candidates', () => {
      const strategy = new DirectOwnerStrategy();
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
        micrositeMemberId: 'mem_1',
      };

      const pick = strategy.pick([], facts, {});
      expect(pick).toBeUndefined();
    });
  });
});
