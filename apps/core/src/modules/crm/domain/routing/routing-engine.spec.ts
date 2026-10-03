import { describe, it, expect } from '@jest/globals';
import { RoutingEngine, type RoutingRule, type RoutingCandidate, type LeadRoutingFacts } from './routing-engine';
import { RoundRobinStrategy } from './strategies';

/**
 * AC-M04-06/07: Routing rules evaluated by priority (ascending), first matching rule wins.
 * Rules with active=false are skipped. Conditions are AND-combined.
 * Eligibility always applied: capacity excludes full sellers (openLeadsToday >= capacityPerPerson ?? capacityPerDay).
 * No eligible seller -> unassigned with reason "No eligible salesperson — sent to the unassigned queue".
 * Each strategy picks: round-robin wraps and persists cursor, least-loaded ratio, skill/territory preference,
 * direct owner if in candidates.
 */
describe('AC-M04-06/07 RoutingEngine and strategies', () => {
  const candidates: RoutingCandidate[] = [
    {
      memberId: 'mem_1',
      displayName: 'Alice',
      orgUnitId: 'ou_life',
      salespersonType: 'ISP',
      capacityPerDay: 20,
      skills: ['LIFE', 'HEALTH'],
      languages: ['en', 'hi'],
      openLeadsToday: 5,
    },
    {
      memberId: 'mem_2',
      displayName: 'Bob',
      orgUnitId: 'ou_health',
      salespersonType: 'POSP',
      capacityPerDay: 15,
      skills: ['HEALTH'],
      languages: ['en'],
      openLeadsToday: 7,
    },
    {
      memberId: 'mem_3',
      displayName: 'Charlie',
      orgUnitId: 'ou_general',
      salespersonType: 'ISP',
      capacityPerDay: 25,
      skills: ['HEALTH', 'GENERAL'],
      languages: ['en', 'hi'],
      openLeadsToday: 8,
    },
  ];

  describe('RoutingEngine with priority ordering', () => {
    it('evaluates rules by priority ascending', async () => {
      const rules: RoutingRule[] = [
        {
          id: 'rule_2',
          priority: 2,
          name: 'Secondary Rule',
          active: true,
          conditions: [{ field: 'source', op: 'eq', value: 'WEB_FORM' }],
          method: 'ROUND_ROBIN',
          slaMinutes: 60,
        },
        {
          id: 'rule_1',
          priority: 1,
          name: 'Primary Rule',
          active: true,
          conditions: [{ field: 'source', op: 'eq', value: 'REFERRAL' }],
          method: 'ROUND_ROBIN',
          slaMinutes: 120,
        },
      ];

      const engine = new RoutingEngine([new RoundRobinStrategy()]);
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'REFERRAL',
      };

      const decision = await engine.route({
        rules,
        facts,
        candidatesFor: async () => candidates,
        cursorFor: async () => undefined,
      });

      expect(decision.memberId).toBe('mem_1');
      expect(decision.ruleId).toBe('rule_1');
    });

    it('skips inactive rules', async () => {
      const rules: RoutingRule[] = [
        {
          id: 'rule_1',
          priority: 1,
          name: 'Inactive Rule',
          active: false,
          conditions: [{ field: 'source', op: 'eq', value: 'WEB_FORM' }],
          method: 'ROUND_ROBIN',
          slaMinutes: 60,
        },
        {
          id: 'rule_2',
          priority: 2,
          name: 'Active Rule',
          active: true,
          conditions: [{ field: 'source', op: 'eq', value: 'WEB_FORM' }],
          method: 'ROUND_ROBIN',
          slaMinutes: 120,
        },
      ];

      const engine = new RoutingEngine([new RoundRobinStrategy()]);
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const decision = await engine.route({
        rules,
        facts,
        candidatesFor: async () => candidates,
        cursorFor: async () => undefined,
      });

      expect(decision.ruleId).toBe('rule_2');
    });

    it('uses AND logic for multiple conditions', async () => {
      const rules: RoutingRule[] = [
        {
          id: 'rule_1',
          priority: 1,
          name: 'Multi-condition',
          active: true,
          conditions: [
            { field: 'source', op: 'eq', value: 'WEB_FORM' },
            { field: 'line', op: 'eq', value: 'HEALTH' },
          ],
          method: 'ROUND_ROBIN',
          slaMinutes: 60,
        },
      ];

      const engine = new RoutingEngine([new RoundRobinStrategy()]);

      // Should not match when one condition is false
      const facts1: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const decision1 = await engine.route({
        rules,
        facts: facts1,
        candidatesFor: async () => candidates,
        cursorFor: async () => undefined,
      });

      expect(decision1.memberId).toBeUndefined();
      expect(decision1.reason).toBe('No eligible salesperson — sent to the unassigned queue');

      // Should match when both conditions are true
      const facts2: LeadRoutingFacts = {
        productInterest: 'HEALTH',
        line: 'HEALTH',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const decision2 = await engine.route({
        rules,
        facts: facts2,
        candidatesFor: async () => candidates,
        cursorFor: async () => undefined,
      });

      expect(decision2.memberId).toBe('mem_1'); // round-robin with no cursor starts at the first id
    });
  });

  describe('capacity filtering', () => {
    it('filters out sellers at or above capacity', async () => {
      const rules: RoutingRule[] = [
        {
          id: 'rule_1',
          priority: 1,
          name: 'Capacity Test',
          active: true,
          conditions: [],
          method: 'ROUND_ROBIN',
          slaMinutes: 60,
          capacityPerPerson: 7,
        },
      ];

      const engine = new RoutingEngine([new RoundRobinStrategy()]);
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const decision = await engine.route({
        rules,
        facts,
        candidatesFor: async () => candidates,
        cursorFor: async () => undefined,
      });

      // mem_1 has 5 open < 7 capacity (eligible)
      // mem_2 has 7 open >= 7 capacity (excluded)
      // mem_3 has 8 open >= 7 capacity (excluded)
      expect(decision.memberId).toBe('mem_1');
    });

    it('falls through when rule pool is empty', async () => {
      const rules: RoutingRule[] = [
        {
          id: 'rule_1',
          priority: 1,
          name: 'Empty Pool',
          active: true,
          conditions: [{ field: 'source', op: 'eq', value: 'WEB_FORM' }],
          method: 'ROUND_ROBIN',
          slaMinutes: 60,
          capacityPerPerson: 4, // All candidates over this
        },
        {
          id: 'rule_2',
          priority: 2,
          name: 'Fallback',
          active: true,
          conditions: [{ field: 'source', op: 'eq', value: 'WEB_FORM' }],
          method: 'ROUND_ROBIN',
          slaMinutes: 120,
          capacityPerPerson: 20, // Allows all
        },
      ];

      const engine = new RoutingEngine([new RoundRobinStrategy()]);
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const decision = await engine.route({
        rules,
        facts,
        candidatesFor: async () => candidates,
        cursorFor: async () => undefined,
      });

      expect(decision.ruleId).toBe('rule_2');
    });

    it('uses capacityPerDay when capacityPerPerson not set', async () => {
      const rules: RoutingRule[] = [
        {
          id: 'rule_1',
          priority: 1,
          name: 'Day Capacity',
          active: true,
          conditions: [],
          method: 'ROUND_ROBIN',
          slaMinutes: 60,
          // capacityPerPerson not set, use capacityPerDay
        },
      ];

      const engine = new RoutingEngine([new RoundRobinStrategy()]);
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const decision = await engine.route({
        rules,
        facts,
        candidatesFor: async () => [{ ...candidates[0], openLeadsToday: 20 }, ...candidates.slice(1)], // mem_1 is at its capacityPerDay (20)
        cursorFor: async () => undefined,
      });

      expect(decision.memberId).toBe('mem_2');
      expect(decision.skipped).toEqual([{ memberId: 'mem_1', reason: expect.stringMatching(/capacity/i) }]);
    });
  });

  describe('no eligible seller', () => {
    it('returns unassigned with exact reason text', async () => {
      const rules: RoutingRule[] = [
        {
          id: 'rule_1',
          priority: 1,
          name: 'Empty',
          active: true,
          conditions: [],
          method: 'ROUND_ROBIN',
          slaMinutes: 60,
        },
      ];

      const engine = new RoutingEngine([new RoundRobinStrategy()]);
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const decision = await engine.route({
        rules,
        facts,
        candidatesFor: async () => [], // No candidates
        cursorFor: async () => undefined,
      });

      expect(decision.memberId).toBeUndefined();
      expect(decision.reason).toBe('No eligible salesperson — sent to the unassigned queue');
    });
  });

  describe('skipped list', () => {
    it('populates skipped list when candidates filtered out', async () => {
      const rules: RoutingRule[] = [
        {
          id: 'rule_1',
          priority: 1,
          name: 'High Capacity',
          active: true,
          conditions: [],
          method: 'ROUND_ROBIN',
          slaMinutes: 60,
          capacityPerPerson: 4,
        },
      ];

      const engine = new RoutingEngine([new RoundRobinStrategy()]);
      const facts: LeadRoutingFacts = {
        productInterest: 'TERM_LIFE',
        line: 'LIFE',
        posEligibleProduct: false,
        source: 'WEB_FORM',
      };

      const decision = await engine.route({
        rules,
        facts,
        candidatesFor: async () => candidates,
        cursorFor: async () => undefined,
      });

      expect(decision.skipped.length).toBeGreaterThan(0);
      expect(decision.skipped).toContainEqual(
        expect.objectContaining({
          memberId: 'mem_2',
        })
      );
    });
  });
});
