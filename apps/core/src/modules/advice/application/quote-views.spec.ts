import { biRequired } from './quote-views';

describe('AC-M06-06 benefit illustration rule', () => {
  it.each(['SAVINGS', 'ULIP', 'PENSION', 'CHILD'] as const)('AC-M06-06 a LIFE %s option needs an acknowledged BI', (category) => {
    expect(biRequired({ line: 'LIFE', category })).toBe(true);
  });

  it.each([
    ['LIFE', 'TERM'],
    ['HEALTH', 'HEALTH_INDIVIDUAL'],
    ['HEALTH', 'HEALTH_FLOATER'],
    ['GENERAL', 'MOTOR'],
  ] as const)('AC-M06-06 a %s %s option does not', (line, category) => {
    expect(biRequired({ line, category })).toBe(false);
  });

  it('treats an unknown version as not requiring a BI (it cannot be in scope anyway)', () => {
    expect(biRequired(undefined)).toBe(false);
  });
});
