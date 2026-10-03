/** Rupees typed by the user to whole paise. Returns undefined for blank or non-numeric text. */
export function rupeesToPaise(text: string): number | undefined {
  const cleaned = text.replace(/[,\s]/g, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}
