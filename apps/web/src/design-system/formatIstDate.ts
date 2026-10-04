const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function localeFor(lang: 'en' | 'hi'): string {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

function format(date: Date, lang: 'en' | 'hi', timeZone: string): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(date);
}

export function formatIstDate(isoDate: string, lang: 'en' | 'hi'): string {
  const match = DATE_ONLY.exec(isoDate);
  if (match) {
    const month = Number(match[2]) - 1;
    const date = new Date(Date.UTC(Number(match[1]), month, Number(match[3])));
    const rolledOver = date.getUTCMonth() !== month || date.getUTCDate() !== Number(match[3]);
    return rolledOver ? isoDate : format(date, lang, 'UTC');
  }
  const stamp = new Date(isoDate);
  if (Number.isNaN(stamp.getTime())) {
    return isoDate;
  }
  return format(stamp, lang, 'Asia/Kolkata');
}
