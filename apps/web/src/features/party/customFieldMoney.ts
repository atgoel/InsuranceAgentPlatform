/**
 * Rupees typed as text to integer paise using string and integer arithmetic only
 * (no float multiplication, so "1234.56" is exactly 123456). Accepts an optional rupee sign,
 * thousands commas and at most two decimals; anything else is undefined.
 */
export function rupeesToPaiseExact(text: string): number | undefined {
  const cleaned = text.replace(/[\s,₹]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return undefined;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return Number.isSafeInteger(paise) ? paise : undefined;
}

/** Integer paise to an editable rupee string ("123456" -> "1234.56", "123400" -> "1234"). */
export function paiseToRupeesText(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const rest = Math.abs(paise % 100);
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`;
}
