/**
 * Calculate relative luminance for WCAG 2.1 contrast ratio
 * @param hex Color in #RRGGBB format
 * @returns Relative luminance (0.0-1.0)
 */
function relativeLuminance(hex: string): number {
  // Remove # and parse hex
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;

  // Apply linearization formula
  const linearize = (c: number): number => {
    if (c <= 0.03928) {
      return c / 12.92;
    }
    return Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const rLinear = linearize(r);
  const gLinear = linearize(g);
  const bLinear = linearize(b);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculate WCAG 2.1 contrast ratio between two colors
 * @param hexA Color A in #RRGGBB format
 * @param hexB Color B in #RRGGBB format
 * @returns Contrast ratio (1.0-21.0)
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum1 = relativeLuminance(hexA);
  const lum2 = relativeLuminance(hexB);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}
