import { Assumptions, CalcOutput, rupees } from './assumptions';
import { CityTier, checkHealthInput, healthSumInsured } from './health-sum-insured';

export interface FloaterInput {
  members: Array<{ age: number }>;
  cityTier: CityTier;
}

export type FloaterRecommendation = 'FLOATER' | 'INDIVIDUAL' | 'FLOATER_PLUS_SENIOR_INDIVIDUAL';

export interface FloaterResult {
  floaterPaise: number;
  individualTotalPaise: number;
  recommendation: FloaterRecommendation;
}

/**
 * Floater cover = the health sum insured for the whole family on one cover; individual total = the sum of each
 * member's own health sum insured. Recommendation: a member aged 60+ with everyone else under 45 →
 * FLOATER_PLUS_SENIOR_INDIVIDUAL; up to 4 members all under 45 → FLOATER; otherwise INDIVIDUAL.
 */
export function floaterSizing(input: FloaterInput, a: Assumptions): CalcOutput<FloaterResult> {
  const ages = Array.isArray(input.members) ? input.members.map((m) => m?.age) : input.members;
  checkHealthInput(input.cityTier, ages, 'members').done();
  const memberAges = ages as number[];

  const sizing = (group: number[]) => healthSumInsured({ cityTier: input.cityTier, ages: group, existingCoverPaise: 0, preExisting: false }, a).result.recommendedPaise;
  const floaterPaise = sizing(memberAges);
  const individualTotalPaise = memberAges.reduce((sum, age) => sum + sizing([age]), 0);
  const recommendation = recommend(memberAges);

  return {
    result: { floaterPaise, individualTotalPaise, recommendation },
    workings: [
      { label: 'Members', value: String(memberAges.length) },
      { label: 'One floater cover for the family', value: rupees(floaterPaise) },
      { label: 'Individual covers, total', value: rupees(individualTotalPaise) },
      { label: 'Recommended structure', value: recommendation },
    ],
    assumptionsVersion: a.version,
  };
}

function recommend(ages: number[]): FloaterRecommendation {
  const seniors = ages.filter((age) => age >= 60);
  const others = ages.filter((age) => age < 60);
  if (seniors.length > 0 && others.length > 0 && others.every((age) => age < 45)) return 'FLOATER_PLUS_SENIOR_INDIVIDUAL';
  if (ages.length <= 4 && ages.every((age) => age < 45)) return 'FLOATER';
  return 'INDIVIDUAL';
}
