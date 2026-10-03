import { ValidationError } from '../../../../kernel/errors/domain-errors';
import { DEFAULT_ASSUMPTIONS as A, ONE_LAKH_PAISE as LAKH, childGoal, floaterSizing, healthSumInsured, protectionGap, retirementCorpus, runCalculator } from './index';

/** Reference values were computed independently from the LLD formulas (M06 §3.1). */
const fieldErrors = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return e.errors.map((x) => `${x.path}:${x.code}`);
    throw e;
  }
  throw new Error('expected a ValidationError');
};

describe('M06 calculators', () => {
  describe('AC-M06-01 protection gap', () => {
    const base = { annualIncomePaise: 12 * LAKH, annualExpensesPaise: 4 * LAKH, yearsToRetire: 25, liabilitiesPaise: 30 * LAKH, existingCoverPaise: 50 * LAKH, liquidAssetsPaise: 5 * LAKH };

    it('AC-M06-01 computes HLV at the real rate, adds liabilities and rounds every amount up to ₹1 lakh', () => {
      const out = protectionGap(base, A);
      // raw HLV ₹1,28,02,203 → ₹1,29,00,000; + ₹30L = ₹1.59 cr; − ₹55L = ₹1.04 cr
      expect(out.result).toEqual({ humanLifeValuePaise: 129 * LAKH, recommendedCoverPaise: 159 * LAKH, gapPaise: 104 * LAKH });
      expect(out.assumptionsVersion).toBe('2026.1');
      expect(out.workings.length).toBeGreaterThan(3);
    });

    it('AC-M06-01 returns a zero gap when existing cover already suffices', () => {
      expect(protectionGap({ ...base, existingCoverPaise: 200 * LAKH }, A).result.gapPaise).toBe(0);
    });

    it('AC-M06-01 treats expenses above income as no surplus', () => {
      const out = protectionGap({ ...base, annualExpensesPaise: 20 * LAKH, liabilitiesPaise: 0 }, A);
      expect(out.result).toEqual({ humanLifeValuePaise: 0, recommendedCoverPaise: 0, gapPaise: 0 });
    });

    it('AC-M06-02 rejects negative and fractional money with field errors', () => {
      expect(fieldErrors(() => protectionGap({ ...base, annualIncomePaise: -1, liabilitiesPaise: 1.5 }, A))).toEqual(['annualIncomePaise:invalid_amount', 'liabilitiesPaise:invalid_amount']);
    });
  });

  describe('AC-M06-02 retirement corpus', () => {
    it('AC-M06-02 inflates expenses, sizes the corpus to life expectancy and projects existing savings and SIP', () => {
      const out = retirementCorpus({ currentAge: 30, retireAge: 60, monthlyExpensePaise: 50_000_00, existingCorpusPaise: 10 * LAKH, monthlySipPaise: 10_000_00 }, A);
      expect(out.result).toEqual({ corpusNeededPaise: 7_714_847_900, projectedPaise: 3_824_232_900, shortfallPaise: 3_890_615_000, monthlySipNeededPaise: 1_871_200 });
      expect(out.assumptionsVersion).toBe('2026.1');
    });

    it('AC-M06-02 reports no shortfall and no SIP when the projection covers the corpus', () => {
      const out = retirementCorpus({ currentAge: 30, retireAge: 60, monthlyExpensePaise: 10_000_00, existingCorpusPaise: 1000 * LAKH, monthlySipPaise: 0 }, A);
      expect(out.result.shortfallPaise).toBe(0);
      expect(out.result.monthlySipNeededPaise).toBe(0);
    });

    it('AC-M06-02 requires the retirement age to be after the current age', () => {
      expect(fieldErrors(() => retirementCorpus({ currentAge: 60, retireAge: 60, monthlyExpensePaise: 1, existingCorpusPaise: 0, monthlySipPaise: 0 }, A))).toEqual(['retireAge:retire_age_not_after_current_age']);
      expect(fieldErrors(() => retirementCorpus({ currentAge: -1, retireAge: 101, monthlyExpensePaise: 1, existingCorpusPaise: 0, monthlySipPaise: 0 }, A))).toEqual(['currentAge:out_of_range', 'retireAge:out_of_range']);
    });
  });

  describe('AC-M06-02 child goal', () => {
    it('AC-M06-02 inflates EDUCATION at education inflation and grows savings', () => {
      expect(childGoal({ goal: 'EDUCATION', currentCostPaise: 20 * LAKH, yearsToGoal: 15, savedPaise: 2 * LAKH }, A).result).toEqual({
        futureCostPaise: 835_449_700,
        shortfallPaise: 751_904_800,
        monthlySipNeededPaise: 1_872_200,
      });
    });

    it('AC-M06-02 inflates MARRIAGE at general inflation', () => {
      expect(childGoal({ goal: 'MARRIAGE', currentCostPaise: 20 * LAKH, yearsToGoal: 15, savedPaise: 0 }, A).result.futureCostPaise).toBe(479_311_700);
    });

    it('AC-M06-02 bounds yearsToGoal to 1–30', () => {
      expect(fieldErrors(() => childGoal({ goal: 'EDUCATION', currentCostPaise: 1, yearsToGoal: 31, savedPaise: 0 }, A))).toEqual(['yearsToGoal:out_of_range']);
      expect(fieldErrors(() => childGoal({ goal: 'EDUCATION', currentCostPaise: 1, yearsToGoal: 0, savedPaise: 0 }, A))).toEqual(['yearsToGoal:out_of_range']);
    });
  });

  describe('AC-M06-02 health sum insured', () => {
    it('AC-M06-02 adds age and pre-existing loadings to the tier base, then 3 years of medical inflation, up to ₹1 lakh', () => {
      const out = healthSumInsured({ cityTier: 1, ages: [50, 48], existingCoverPaise: 5 * LAKH, preExisting: true }, A);
      expect(out.result.recommendedPaise).toBe(22 * LAKH);
      expect(out.result.gapPaise).toBe(17 * LAKH);
      expect(out.result.note).toMatch(/waiting period/);
    });

    it('AC-M06-02 uses ₹10L / ₹7L / ₹5L bases by tier', () => {
      expect(healthSumInsured({ cityTier: 1, ages: [30], existingCoverPaise: 0, preExisting: false }, A).result.recommendedPaise).toBe(15 * LAKH);
      expect(healthSumInsured({ cityTier: 2, ages: [46], existingCoverPaise: 0, preExisting: false }, A).result.recommendedPaise).toBe(13 * LAKH);
      expect(healthSumInsured({ cityTier: 3, ages: [30], existingCoverPaise: 0, preExisting: false }, A).result.recommendedPaise).toBe(8 * LAKH);
    });

    it('AC-M06-02 rejects an unknown tier and invalid ages', () => {
      expect(fieldErrors(() => healthSumInsured({ cityTier: 4 as 1, ages: [30, 101], existingCoverPaise: 0, preExisting: false }, A))).toEqual(['cityTier:invalid_city_tier', 'ages.1:out_of_range']);
    });
  });

  describe('AC-M06-02 floater sizing', () => {
    it('AC-M06-02 recommends FLOATER for up to 4 members all under 45', () => {
      const out = floaterSizing({ cityTier: 2, members: [{ age: 35 }, { age: 33 }, { age: 5 }] }, A);
      expect(out.result).toEqual({ floaterPaise: 10 * LAKH, individualTotalPaise: 30 * LAKH, recommendation: 'FLOATER' });
    });

    it('AC-M06-02 recommends FLOATER_PLUS_SENIOR_INDIVIDUAL for a senior with everyone else under 45', () => {
      expect(floaterSizing({ cityTier: 1, members: [{ age: 65 }, { age: 35 }, { age: 30 }] }, A).result.recommendation).toBe('FLOATER_PLUS_SENIOR_INDIVIDUAL');
    });

    it('AC-M06-02 recommends INDIVIDUAL otherwise', () => {
      expect(floaterSizing({ cityTier: 1, members: [{ age: 50 }, { age: 20 }] }, A).result.recommendation).toBe('INDIVIDUAL');
      expect(floaterSizing({ cityTier: 1, members: [1, 2, 3, 4, 5].map((age) => ({ age })) }, A).result.recommendation).toBe('INDIVIDUAL');
      expect(floaterSizing({ cityTier: 1, members: [{ age: 65 }, { age: 50 }] }, A).result.recommendation).toBe('INDIVIDUAL');
    });

    it('AC-M06-02 accepts 1–8 members', () => {
      expect(fieldErrors(() => floaterSizing({ cityTier: 1, members: [] }, A))).toEqual(['members:invalid_member_count']);
      expect(fieldErrors(() => floaterSizing({ cityTier: 1, members: Array.from({ length: 9 }, () => ({ age: 30 })) }, A))).toEqual(['members:invalid_member_count']);
    });
  });

  it('AC-M06-03 every calculator output carries the assumptions version', () => {
    const custom = { ...A, version: 'test.9' };
    expect(runCalculator('floater', { cityTier: 1, members: [{ age: 30 }] }, custom).assumptionsVersion).toBe('test.9');
    expect(runCalculator('protection-gap', { annualIncomePaise: 0, annualExpensesPaise: 0, yearsToRetire: 0, liabilitiesPaise: 0, existingCoverPaise: 0, liquidAssetsPaise: 0 }, custom).assumptionsVersion).toBe('test.9');
  });
});
