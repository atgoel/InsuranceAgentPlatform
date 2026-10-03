import { Assumptions, CalcOutput, InputCheck, ceilRupee, floorRupee, monthlyRate, percent, rupees, sipFactor } from './assumptions';

export interface RetirementInput {
  currentAge: number;
  retireAge: number;
  monthlyExpensePaise: number;
  existingCorpusPaise: number;
  monthlySipPaise: number;
}

export interface RetirementResult {
  corpusNeededPaise: number;
  projectedPaise: number;
  shortfallPaise: number;
  monthlySipNeededPaise: number;
}

/**
 * Today's expense is inflated to retirement; the corpus is the value at retirement of yearly expenses that keep
 * growing with inflation, withdrawn at the start of each year until life expectancy and discounted at the
 * post-retirement return. The projection grows the existing corpus yearly and the SIP monthly (start of month) at the
 * pre-retirement return. The SIP needed is the additional monthly amount that closes the shortfall.
 */
export function retirementCorpus(input: RetirementInput, a: Assumptions): CalcOutput<RetirementResult> {
  new InputCheck()
    .integer('currentAge', input.currentAge, 0, 100)
    .integer('retireAge', input.retireAge, 0, 100)
    .rule(!(input.retireAge <= input.currentAge), 'retireAge', 'retire_age_not_after_current_age', 'Retirement age must be after the current age')
    .money('monthlyExpensePaise', input.monthlyExpensePaise)
    .money('existingCorpusPaise', input.existingCorpusPaise)
    .money('monthlySipPaise', input.monthlySipPaise)
    .done();

  const yearsToRetire = input.retireAge - input.currentAge;
  const yearsInRetirement = Math.max(0, a.lifeExpectancy - input.retireAge);
  const firstYearExpense = input.monthlyExpensePaise * 12 * Math.pow(1 + a.inflation, yearsToRetire);
  const corpusNeededPaise = ceilRupee(firstYearExpense * growingAnnuityDue(a.returnPostRetirement, a.inflation, yearsInRetirement));

  const months = yearsToRetire * 12;
  const factor = sipFactor(monthlyRate(a.returnPreRetirement), months);
  const projectedPaise = floorRupee(input.existingCorpusPaise * Math.pow(1 + a.returnPreRetirement, yearsToRetire) + input.monthlySipPaise * factor);
  const shortfallPaise = Math.max(0, corpusNeededPaise - projectedPaise);
  const monthlySipNeededPaise = shortfallPaise === 0 || factor === 0 ? 0 : ceilRupee(shortfallPaise / factor);

  return {
    result: { corpusNeededPaise, projectedPaise, shortfallPaise, monthlySipNeededPaise },
    workings: [
      { label: 'Years to retirement', value: String(yearsToRetire) },
      { label: `Yearly expense at retirement (inflation ${percent(a.inflation)})`, value: rupees(firstYearExpense) },
      { label: `Years in retirement (to age ${a.lifeExpectancy})`, value: String(yearsInRetirement) },
      { label: `Corpus needed (return after retirement ${percent(a.returnPostRetirement)})`, value: rupees(corpusNeededPaise) },
      { label: `Projected corpus (return before retirement ${percent(a.returnPreRetirement)})`, value: rupees(projectedPaise) },
      { label: 'Shortfall', value: rupees(shortfallPaise) },
      { label: 'Additional monthly SIP needed', value: rupees(monthlySipNeededPaise) },
    ],
    assumptionsVersion: a.version,
  };
}

/** Present value (at the first payment) of `years` payments growing at `g`, discounted at `r`, paid at the start of each year. */
function growingAnnuityDue(r: number, g: number, years: number): number {
  if (years <= 0) return 0;
  if (Math.abs(r - g) < 1e-12) return years;
  return ((1 - Math.pow((1 + g) / (1 + r), years)) / (r - g)) * (1 + r);
}
