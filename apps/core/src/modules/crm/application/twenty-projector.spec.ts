import { premiumBand } from './twenty-projector';

describe('AC-M04-22 premium bands sent to Twenty (never the exact premium)', () => {
  it.each([
    [0, '<15k'], [1_499_999, '<15k'], [1_500_000, '15-30k'], [2_999_999, '15-30k'], [3_000_000, '30-50k'], [4_999_999, '30-50k'], [5_000_000, '>50k'],
  ])('AC-M04-22 %i paise → %s', (paise, band) => {
    expect(premiumBand(paise)).toBe(band);
  });
});
