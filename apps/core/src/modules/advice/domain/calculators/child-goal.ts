import { Assumptions, CalcOutput, InputCheck, ceilRupee, monthlyRate, percent, rupees, sipFactor } from './assumptions';

export interface ChildGoalInput {
  goal: 'EDUCATION' | 'MARRIAGE';
  currentCostPaise: number;
  yearsToGoal: number;
  savedPaise: number;
}

export interface ChildGoalResult {
  futureCostPaise: number;
  shortfallPaise: number;
  monthlySipNeededPaise: number;
}

/**
 * EDUCATION inflates at the education inflation, MARRIAGE at general inflation. Savings already set aside grow at the
 * pre-retirement return; the SIP needed (start of month) closes the remaining shortfall.
 */
export function childGoal(input: ChildGoalInput, a: Assumptions): CalcOutput<ChildGoalResult> {
  new InputCheck()
    .rule(input.goal === 'EDUCATION' || input.goal === 'MARRIAGE', 'goal', 'invalid_goal', 'Goal must be EDUCATION or MARRIAGE')
    .money('currentCostPaise', input.currentCostPaise)
    .integer('yearsToGoal', input.yearsToGoal, 1, 30)
    .money('savedPaise', input.savedPaise)
    .done();

  const inflation = input.goal === 'EDUCATION' ? a.educationInflation : a.inflation;
  const futureCostPaise = ceilRupee(input.currentCostPaise * Math.pow(1 + inflation, input.yearsToGoal));
  const savedGrown = input.savedPaise * Math.pow(1 + a.returnPreRetirement, input.yearsToGoal);
  const shortfallPaise = ceilRupee(Math.max(0, futureCostPaise - savedGrown));
  const factor = sipFactor(monthlyRate(a.returnPreRetirement), input.yearsToGoal * 12);
  const monthlySipNeededPaise = shortfallPaise === 0 ? 0 : ceilRupee(shortfallPaise / factor);

  return {
    result: { futureCostPaise, shortfallPaise, monthlySipNeededPaise },
    workings: [
      { label: `Cost in ${input.yearsToGoal} years (inflation ${percent(inflation)})`, value: rupees(futureCostPaise) },
      { label: `Savings grown at ${percent(a.returnPreRetirement)}`, value: rupees(savedGrown) },
      { label: 'Shortfall', value: rupees(shortfallPaise) },
      { label: 'Monthly SIP needed', value: rupees(monthlySipNeededPaise) },
    ],
    assumptionsVersion: a.version,
  };
}
