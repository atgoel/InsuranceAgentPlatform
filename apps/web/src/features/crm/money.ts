/**
 * Integer paise to a rupee label, e.g. 12345600 -> "₹1,23,456".
 * Integer arithmetic only: the remainder is shown as two digits when it is not zero.
 */
export function formatPaise(paise: number): string {
  const remainder = paise % 100;
  const rupees = (paise - remainder) / 100;
  const whole = new Intl.NumberFormat('en-IN').format(rupees);
  if (remainder === 0) {
    return `₹${whole}`;
  }
  return `₹${whole}.${String(remainder).padStart(2, '0')}`;
}
