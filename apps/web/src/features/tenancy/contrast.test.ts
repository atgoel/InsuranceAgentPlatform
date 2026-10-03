import { describe, it, expect } from 'vitest';
import { contrastRatio } from './contrast';

describe('AC-M01-05 contrastRatio WCAG 2.1', () => {
  it('calculates contrast between white and black as 21:1', () => {
    const ratio = contrastRatio('#FFFFFF', '#000000');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('calculates contrast between primary brand color and white', () => {
    // #1F5FBF (#FFFFFF should be ~6.0 per spec
    const ratio = contrastRatio('#1F5FBF', '#FFFFFF');
    expect(ratio).toBeGreaterThan(5.9);
    expect(ratio).toBeLessThan(6.1);
  });

  it('rejects colors below 4.5:1 threshold', () => {
    // Light blue on white - should be below 4.5
    const ratio = contrastRatio('#E8EEF7', '#FFFFFF');
    expect(ratio).toBeLessThan(4.5);
  });

  it('accepts colors above 4.5:1 threshold', () => {
    // Dark blue on white - should be above 4.5
    const ratio = contrastRatio('#1F5FBF', '#FFFFFF');
    expect(ratio).toBeGreaterThan(4.5);
  });

  it('is symmetric (order does not matter)', () => {
    const ratio1 = contrastRatio('#FF0000', '#FFFFFF');
    const ratio2 = contrastRatio('#FFFFFF', '#FF0000');
    expect(ratio1).toBeCloseTo(ratio2);
  });

  it('calculates correct ratio for light gray on white', () => {
    // Very close to white, low contrast
    const ratio = contrastRatio('#F0F0F0', '#FFFFFF');
    expect(ratio).toBeLessThan(1.2);
  });
});
