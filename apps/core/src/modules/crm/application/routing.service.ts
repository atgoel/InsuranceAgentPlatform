import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { Lead, lineOfBusiness } from '../domain/lead';
import { CRM_EVENTS } from '../domain/events';
import { LeadRoutingFacts, RoutingRule } from '../domain/routing/routing-rule';
import { RoutingCandidate, RoutingDecision, RoutingEngine } from '../domain/routing/routing-engine';
import { DirectOwnerStrategy, LeastLoadedStrategy, RoundRobinStrategy, SkillStrategy, TerritoryStrategy } from '../domain/routing/strategies';
import {
  LEAD_REPOSITORY, LeadRepository, POS_ELIGIBILITY, PosEligibilityPolicy, ROUTING_RULE_REPOSITORY, RoutingRuleRepository, SELLER_DIRECTORY,
  SellerDirectory, Transaction,
} from './ports';
import { CrmContext } from './crm-context';
import { istDayStart } from './crm-scope';

const MAX_RULES = 50;
const SOLO_REASON = 'Solo tenant owner';

export interface CapacityRow {
  memberId: string;
  displayName: string;
  salespersonType: string;
  openLeadsToday: number;
  capacityPerDay: number;
  available: boolean;
  reason?: string;
}

/** Lead routing (F05, CRM07): rules → eligible pool (M02) → capacity → strategy. */
@Injectable()
export class RoutingService {
  private readonly engine = new RoutingEngine([
    new RoundRobinStrategy(), new LeastLoadedStrategy(), new TerritoryStrategy(), new SkillStrategy(), new DirectOwnerStrategy(),
  ]);

  constructor(
    @Inject(ROUTING_RULE_REPOSITORY) private readonly rules: RoutingRuleRepository,
    @Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
    @Inject(POS_ELIGIBILITY) private readonly pos: PosEligibilityPolicy,
    private readonly ctx: CrmContext,
  ) {}

  factsFor(lead: Lead): LeadRoutingFacts {
    const p = lead.props;
    return {
      productInterest: p.productInterest, line: lineOfBusiness(p.productInterest), posEligibleProduct: this.pos.isPosEligible(p.productInterest),
      source: p.attribution.source, pincode: p.pincode, campaignId: p.attribution.campaignId, language: p.language,
      micrositeMemberId: p.attribution.micrositeMemberId,
    };
  }

  /** Decides and advances the round-robin cursor. `exclude` keeps a breached owner out of re-routing. */
  async decide(tx: Transaction, lead: Lead, opts: { solo: boolean; exclude?: string }): Promise<RoutingDecision> {
    const at = this.ctx.clock.now();
    if (opts.solo) return this.soloDecision(tx, at);
    const rules = await this.rules.list(tx);
    const decision = await this.engine.route({
      rules,
      facts: this.factsFor(lead),
      candidatesFor: async (rule) => (await this.candidates(tx, rule, this.factsFor(lead), at)).filter((c) => c.memberId !== opts.exclude),
      cursorFor: (ruleId) => this.rules.cursor(tx, ruleId),
    });
    if (decision.ruleId && decision.memberId) await this.rules.setCursor(tx, decision.ruleId, decision.memberId);
    const method = rules.find((r) => r.id === decision.ruleId)?.method ?? 'NONE';
    this.ctx.metrics
      .counter('crm_routing_decisions_total', 'Lead routing decisions', ['method', 'outcome'])
      .inc({ method, outcome: decision.memberId ? 'assigned' : 'unassigned' });
    return decision;
  }

  rulesFor(principal: Principal): Promise<RoutingRule[]> {
    return this.ctx.uow.run(principal.tenantId, (tx) => this.rules.list(tx));
  }

  replaceRules(principal: Principal, rules: RoutingRule[]): Promise<RoutingRule[]> {
    assertValidRules(rules);
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      await this.rules.replaceAll(tx, rules);
      await this.ctx.recorder.record(tx, {
        event: { type: CRM_EVENTS.ROUTING_RULES_UPDATED, subject: principal.tenantId, data: { count: rules.length } },
        audit: { action: CRM_EVENTS.ROUTING_RULES_UPDATED, entityType: 'routing_rules', entityId: principal.tenantId, metadata: { ruleIds: rules.map((r) => r.id) } },
      });
      return rules;
    });
  }

  /** "Test a lead": no side effects — the cursor is read, never advanced. */
  simulate(principal: Principal, facts: Omit<LeadRoutingFacts, 'line' | 'posEligibleProduct'>): Promise<RoutingDecision & { memberName?: string }> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const at = this.ctx.clock.now();
      const full: LeadRoutingFacts = { ...facts, line: lineOfBusiness(facts.productInterest), posEligibleProduct: this.pos.isPosEligible(facts.productInterest) };
      const names = new Map<string, string>();
      const decision = await this.engine.route({
        rules: await this.rules.list(tx),
        facts: full,
        candidatesFor: async (rule) => {
          const pool = await this.candidates(tx, rule, full, at);
          pool.forEach((c) => names.set(c.memberId, c.displayName));
          return pool;
        },
        cursorFor: (ruleId) => this.rules.cursor(tx, ruleId),
      });
      return { ...decision, memberName: decision.memberId ? names.get(decision.memberId) : undefined };
    });
  }

  capacity(principal: Principal): Promise<CapacityRow[]> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const at = this.ctx.clock.now();
      const sellers = await this.sellers.eligibleSellers(tx, { at });
      const counts = await this.leads.countOpenToday(tx, sellers.map((s) => s.memberId), istDayStart(at));
      return sellers.map((s) => {
        const open = counts[s.memberId] ?? 0;
        const available = open < s.capacityPerDay;
        return {
          memberId: s.memberId, displayName: s.displayName, salespersonType: s.salespersonType, openLeadsToday: open, capacityPerDay: s.capacityPerDay,
          available, reason: available ? undefined : 'At daily capacity',
        };
      });
    });
  }

  private async candidates(tx: Transaction, rule: RoutingRule, facts: LeadRoutingFacts, at: Date): Promise<RoutingCandidate[]> {
    const eligible = await this.sellers.eligibleSellers(tx, {
      withinOrgUnitId: rule.targetOrgUnitId, line: facts.line, posEligibleProduct: facts.posEligibleProduct, language: facts.language, at,
    });
    const counts = await this.leads.countOpenToday(tx, eligible.map((s) => s.memberId), istDayStart(at));
    return eligible.map((s) => ({ ...s, openLeadsToday: counts[s.memberId] ?? 0 }));
  }

  /** Solo tenants bypass routing: the single active member owns every lead (HLD §10). */
  private async soloDecision(tx: Transaction, at: Date): Promise<RoutingDecision> {
    const [owner] = await this.sellers.eligibleSellers(tx, { at });
    return owner
      ? { memberId: owner.memberId, orgUnitId: owner.orgUnitId, reason: SOLO_REASON, skipped: [] }
      : { reason: 'No eligible salesperson — sent to the unassigned queue', skipped: [] };
  }
}

function assertValidRules(rules: RoutingRule[]): void {
  if (rules.length > MAX_RULES) throw new ValidationError('too_many_rules', `At most ${MAX_RULES} routing rules`);
  const priorities = new Set(rules.map((r) => r.priority));
  if (priorities.size !== rules.length) throw new ValidationError('duplicate_priority', 'Rule priorities must be unique');
  if (new Set(rules.map((r) => r.id)).size !== rules.length) throw new ValidationError('duplicate_rule_id', 'Rule ids must be unique');
}

/** Default POS eligibility until M05: simple, IRDAI POS-type lines (term, health indemnity, motor). */
export class DefaultPosEligibility {
  private static readonly POS_LINES = new Set(['TERM_LIFE', 'HEALTH', 'HEALTH_FLOATER', 'MOTOR']);

  isPosEligible(product: string): boolean {
    return DefaultPosEligibility.POS_LINES.has(product);
  }
}
