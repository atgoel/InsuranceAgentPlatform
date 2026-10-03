import { describe, it, expect } from 'vitest';
import { paiseToRupeesText, rupeesToPaiseExact } from './customFieldMoney';

describe('AC-CR001-08 custom field money conversion', () => {
  it.each([
    ['1234.56', 123456],
    ['1,23,456.7', 12345670],
    ['₹ 0.29', 29],
    ['19.99', 1999],
    ['4.35', 435],
    ['1.1', 110],
    ['500', 50000],
    ['0', 0],
  ])('AC-CR001-08 %s rupees is %i paise exactly', (text, paise) => {
    expect(rupeesToPaiseExact(text)).toBe(paise);
  });

  it.each(['', 'abc', '1.234', '-5', '1e5', '1..2', '99999999999999999999'])('AC-CR001-08 rejects %j', (text) => {
    expect(rupeesToPaiseExact(text)).toBeUndefined();
  });

  it('AC-CR001-08 formats paise back to an editable rupee string', () => {
    expect([123456, 123400, 5, 110, 0].map(paiseToRupeesText)).toEqual(['1234.56', '1234', '0.05', '1.10', '0']);
  });
});
