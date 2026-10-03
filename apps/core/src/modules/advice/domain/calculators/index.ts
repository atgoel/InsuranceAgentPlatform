import { Assumptions, CalcOutput } from './assumptions';
import { protectionGap } from './protection-gap';
import { retirementCorpus } from './retirement';
import { childGoal } from './child-goal';
import { healthSumInsured } from './health-sum-insured';
import { floaterSizing } from './floater';

export * from './assumptions';
export * from './protection-gap';
export * from './retirement';
export * from './child-goal';
export * from './health-sum-insured';
export * from './floater';

export const CALCULATORS = ['protection-gap', 'retirement', 'child-goal', 'health-sum-insured', 'floater'] as const;
export type CalculatorName = (typeof CALCULATORS)[number];

type AnyCalculator = (input: never, a: Assumptions) => CalcOutput<object>;

const REGISTRY: Record<CalculatorName, AnyCalculator> = {
  'protection-gap': protectionGap,
  retirement: retirementCorpus,
  'child-goal': childGoal,
  'health-sum-insured': healthSumInsured,
  floater: floaterSizing,
};

export function isCalculatorName(name: string): name is CalculatorName {
  return (CALCULATORS as readonly string[]).includes(name);
}

/** Runs a calculator by its API name; the input is validated by the calculator itself (field errors). */
export function runCalculator(name: CalculatorName, input: Record<string, unknown>, a: Assumptions): CalcOutput<object> {
  return (REGISTRY[name] as (input: Record<string, unknown>, a: Assumptions) => CalcOutput<object>)(input, a);
}
