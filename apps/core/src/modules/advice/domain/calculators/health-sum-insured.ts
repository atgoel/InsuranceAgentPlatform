import { Assumptions, CalcOutput, InputCheck, ONE_LAKH_PAISE, percent, roundUpToLakh, rupees } from './assumptions';

export type CityTier = 1 | 2 | 3;

export interface HealthSumInsuredInput {
  cityTier: CityTier;
  ages: number[];
  existingCoverPaise: number;
  preExisting: boolean;
}

export interface HealthSumInsuredResult {
  recommendedPaise: number;
  gapPaise: number;
  note: string;
}

export const TIER_BASE_PAISE: Record<CityTier, number> = { 1: 10 * ONE_LAKH_PAISE, 2: 7 * ONE_LAKH_PAISE, 3: 5 * ONE_LAKH_PAISE };
const INFLATION_YEARS = 3;

/** Base by city tier, +25% of base if anyone is 45 or older, +25% of base for pre-existing conditions, 3-year medical inflation; up to ₹1 lakh. */
export function healthSumInsured(input: HealthSumInsuredInput, a: Assumptions): CalcOutput<HealthSumInsuredResult> {
  checkHealthInput(input.cityTier, input.ages).money('existingCoverPaise', input.existingCoverPaise).done();

  const base = TIER_BASE_PAISE[input.cityTier];
  const olderLoad = input.ages.some((age) => age >= 45) ? 0.25 : 0;
  const pedLoad = input.preExisting ? 0.25 : 0;
  const loaded = base * (1 + olderLoad + pedLoad);
  const recommendedPaise = roundUpToLakh(loaded * Math.pow(1 + a.medicalInflation, INFLATION_YEARS));
  const gapPaise = Math.max(0, recommendedPaise - input.existingCoverPaise);
  const note = input.preExisting
    ? 'Includes a 3-year medical inflation buffer. Pre-existing conditions usually carry a waiting period; check each plan.'
    : 'Includes a 3-year medical inflation buffer.';

  return {
    result: { recommendedPaise, gapPaise, note },
    workings: [
      { label: `Base cover for a tier ${input.cityTier} city`, value: rupees(base) },
      { label: 'Loading: member aged 45 or more', value: percent(olderLoad) },
      { label: 'Loading: pre-existing conditions', value: percent(pedLoad) },
      { label: `Medical inflation ${percent(a.medicalInflation)} for ${INFLATION_YEARS} years`, value: rupees(recommendedPaise) },
      { label: 'Less existing cover', value: rupees(input.existingCoverPaise) },
      { label: 'Gap', value: rupees(gapPaise) },
    ],
    assumptionsVersion: a.version,
  };
}

/** Shared by the floater calculator: tier 1–3, 1–8 members aged 0–100. */
export function checkHealthInput(cityTier: unknown, ages: unknown, path = 'ages'): InputCheck {
  const check = new InputCheck().rule(cityTier === 1 || cityTier === 2 || cityTier === 3, 'cityTier', 'invalid_city_tier', 'City tier must be 1, 2 or 3');
  if (!Array.isArray(ages) || ages.length < 1 || ages.length > 8) return check.rule(false, path, 'invalid_member_count', 'Between 1 and 8 members');
  ages.forEach((age, i) => check.integer(`${path}.${i}`, age, 0, 100));
  return check;
}
