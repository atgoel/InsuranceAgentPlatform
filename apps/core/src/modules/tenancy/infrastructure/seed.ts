import { PlanCatalogue } from '../domain/plan';
import { TieUpLimitPolicy } from '../domain/tie-up';

export function seedPlanCatalogue(): PlanCatalogue {
  return PlanCatalogue.default();
}

export function seedTieUpLimitPolicy(): TieUpLimitPolicy {
  return TieUpLimitPolicy.default();
}
