import { formatIstDate } from '../../../design-system';

type Lang = 'en' | 'hi';

function locale(lang: Lang): string {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

/** Date and time in IST, for values that carry a real time of day (tasks, SLA deadlines). */
export function formatIstDateTime(iso: string, lang: Lang): string {
  const date = formatIstDate(iso, lang);
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return date;
  const time = new Intl.DateTimeFormat(locale(lang), { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(stamp);
  return `${date}, ${time}`;
}

/** Dues and follow-ups are date-only on the server (stored as IST midnight): never show a time for them. */
export function formatDueWhen(iso: string, lang: Lang, dateOnly: boolean): string {
  return dateOnly ? formatIstDate(iso, lang) : formatIstDateTime(iso, lang);
}
