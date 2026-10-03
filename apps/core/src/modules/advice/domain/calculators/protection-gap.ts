import { Assumptions, CalcOutput, InputCheck, percent, roundUpToLakh, rupees } from './assumptions';

export interface ProtectionGapInput {
  annualIncomePaise: number;
  annualExpensesPaise: number;
  yearsToRetire: number;
  liabilitiesPaise: number;
  existingCoverPaise: number;
  liquidAssetsPaise: number;
}

export interface ProtectionGapResult {
  humanLifeValuePaise: number;
  recommendedCoverPaise: number;
  gapPaise: number;
}

/**
 * Human life value: present value of the yearly surplus (income − personal expenses) until retirement, paid at each
 * year end and discounted at the real rate (1 + return) / (1 + inflation) − 1. Recommended cover adds liabilities;
 * the gap subtracts existing cover and liquid assets. Every amount is rounded up to the next ₹1 lakh.
 */
export function protectionGap(input: ProtectionGapInput, a: Assumptions): CalcOutput<ProtectionGapResult> {
  new InputCheck()
    .money('annualIncomePaise', input.annualIncomePaise)
    .money('annualExpensesPaise', input.annualExpensesPaise)
    .integer('yearsToRetire', input.yearsToRetire, 0, 100)
    .money('liabilitiesPaise', input.liabilitiesPaise)
    .money('existingCoverPaise', input.existingCoverPaise)
    .money('liquidAssetsPaise', input.liquidAssetsPaise)
    .done();

  const realRate = (1 + a.returnPreRetirement) / (1 + a.inflation) - 1;
  const surplus = Math.max(0, input.annualIncomePaise - input.annualExpensesPaise);
  const n = input.yearsToRetire;
  const annuity = realRate === 0 ? n : (1 - Math.pow(1 + realRate, -n)) / realRate;
  const humanLifeValuePaise = roundUpToLakh(surplus * annuity);
  const recommendedCoverPaise = roundUpToLakh(humanLifeValuePaise + input.liabilitiesPaise);
  const gapPaise = roundUpToLakh(Math.max(0, recommendedCoverPaise - input.existingCoverPaise - input.liquidAssetsPaise));

  return {
    result: { humanLifeValuePaise, recommendedCoverPaise, gapPaise },
    workings: [
      { label: 'Yearly surplus (income − personal expenses)', value: rupees(surplus) },
      { label: 'Real discount rate', value: percent(realRate) },
      { label: `Present value over ${n} years (human life value)`, value: rupees(humanLifeValuePaise) },
      { label: 'Plus liabilities', value: rupees(input.liabilitiesPaise) },
      { label: 'Recommended cover', value: rupees(recommendedCoverPaise) },
      { label: 'Less existing cover and liquid assets', value: rupees(input.existingCoverPaise + input.liquidAssetsPaise) },
      { label: 'Protection gap (rounded up to ₹1 lakh)', value: rupees(gapPaise) },
    ],
    assumptionsVersion: a.version,
  };
}
