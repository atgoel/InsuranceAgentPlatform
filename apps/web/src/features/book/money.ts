const RUPEE = '₹';
const PAISE_PER_RUPEE = 100n;
const LAKH = 100000n;
const THOUSAND = 1000n;

function groupRupees(rupees: bigint): string {
  return new Intl.NumberFormat('en-IN').format(rupees);
}

/** Integer paise to a rupee string without float arithmetic, e.g. 12345678 becomes ₹1,23,456.78. */
export function formatPaise(paise: number): string {
  const amount = BigInt(paise);
  const rupees = amount / PAISE_PER_RUPEE;
  const rest = amount % PAISE_PER_RUPEE;
  const fraction = rest === 0n ? '' : `.${String(rest).padStart(2, '0')}`;
  return `${RUPEE}${groupRupees(rupees)}${fraction}`;
}

/** Short form for a calendar cell: ₹1.5L, ₹25k or ₹900 (truncated, never rounded up). */
export function compactPaise(paise: number): string {
  const rupees = BigInt(paise) / PAISE_PER_RUPEE;
  if (rupees >= LAKH) {
    const tenths = (rupees % LAKH) / (LAKH / 10n);
    return `${RUPEE}${rupees / LAKH}${tenths === 0n ? '' : `.${tenths}`}L`;
  }
  if (rupees >= THOUSAND) {
    return `${RUPEE}${rupees / THOUSAND}k`;
  }
  return `${RUPEE}${rupees}`;
}
