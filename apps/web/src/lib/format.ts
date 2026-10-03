/**
 * Format money (paise) to en-IN format with rupee symbol
 * @param paise Amount in paise (100 paise = 1 rupee)
 * @returns Formatted string, e.g. "₹1,23,456.78"
 */
export function formatMoney(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(rupees);
}

/**
 * Format date to readable format
 * @param date Date to format
 * @param lang Language code (en or hi)
 * @returns Formatted date string
 */
export function formatDate(date: Date, lang: 'en' | 'hi' = 'en'): string {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
