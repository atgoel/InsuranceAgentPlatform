import { Specification } from '../../../../kernel/domain/specification';
import type { ProductLine, LeadSource } from '../lead';

export interface LeadRoutingFacts {
  productInterest: ProductLine;
  line: 'LIFE' | 'HEALTH' | 'GENERAL';
  posEligibleProduct: boolean;
  source: LeadSource;
  pincode?: string;
  campaignId?: string;
  language?: string;
  micrositeMemberId?: string;
}

export type ConditionField = 'productInterest' | 'line' | 'source' | 'pincodePrefix' | 'campaignId' | 'language';

export interface RuleCondition {
  field: ConditionField;
  op: 'eq' | 'in' | 'startsWith';
  value: string | string[];
}

export type RoutingMethod = 'ROUND_ROBIN' | 'LEAST_LOADED' | 'TERRITORY' | 'SKILL' | 'DIRECT_OWNER';

export interface RoutingRule {
  id: string;
  priority: number;
  name: string;
  active: boolean;
  conditions: RuleCondition[]; // AND-combined
  method: RoutingMethod;
  targetOrgUnitId?: string;
  slaMinutes: number; // 15..1440
  onBreach?: 'NOTIFY_MANAGER' | 'NOTIFY_THEN_REASSIGN';
  reassignAfterMinutes?: number;
  capacityPerPerson?: number;
}

export function conditionSpec(conditions: RuleCondition[]): Specification<LeadRoutingFacts> {
  if (conditions.length === 0) {
    return Specification.of(() => true, 'no_conditions');
  }

  let spec = createSingleConditionSpec(conditions[0]);
  for (let i = 1; i < conditions.length; i++) {
    spec = spec.and(createSingleConditionSpec(conditions[i]));
  }
  return spec;
}

/** Typed read of a condition field; 'pincodePrefix' conditions read the pincode. */
function fieldValue(facts: LeadRoutingFacts, field: ConditionField): string | undefined {
  const key = field === 'pincodePrefix' ? 'pincode' : field;
  return facts[key];
}

const OPERATORS: Record<RuleCondition['op'], (actual: string | undefined, expected: string | string[]) => boolean> = {
  eq: (actual, expected) => actual === expected,
  in: (actual, expected) => actual !== undefined && (Array.isArray(expected) ? expected : [expected]).includes(actual),
  startsWith: (actual, expected) => typeof expected === 'string' && actual !== undefined && actual.startsWith(expected),
};

function createSingleConditionSpec(cond: RuleCondition): Specification<LeadRoutingFacts> {
  const matches = OPERATORS[cond.op];
  const label = `${cond.field}_${cond.op}_${Array.isArray(cond.value) ? cond.value.join(',') : cond.value}`;
  return Specification.of((facts: LeadRoutingFacts) => matches(fieldValue(facts, cond.field), cond.value), label);
}
