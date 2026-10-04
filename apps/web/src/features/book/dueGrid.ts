import type { Tone } from '../../design-system';
import type { DueItem } from './api';

export interface DueDay {
  date: string;
  dues: DueItem[];
}

export interface DayCell {
  date: string;
  dayOfMonth: number;
  count: number;
  totalPaise: number;
  tone?: Tone;
}

const SEVERITY: Record<Tone, number> = { bad: 3, warn: 2, info: 1, neutral: 1, ok: 0 };

/** Presentation only: which colour the server-provided classification is drawn in. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'LAPSED':
    case 'REVIVABLE':
      return 'bad';
    case 'IN_GRACE':
      return 'warn';
    case 'PAID':
      return 'ok';
    default:
      return 'neutral';
  }
}

export function worstTone(items: DueItem[]): Tone | undefined {
  let worst: Tone | undefined;
  for (const item of items) {
    const tone = statusTone(item.status);
    if (worst === undefined || SEVERITY[tone] > SEVERITY[worst]) {
      worst = tone;
    }
  }
  return worst;
}

export function daysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` };
}

/** Number of empty cells before day 1 in a Monday-first week. */
export function leadingBlanks(month: string): number {
  const [year, m] = month.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

export function matchesLine(item: DueItem, line: string): boolean {
  return !line || item.line === line;
}

export function buildCells(month: string, days: DueDay[], line: string): DayCell[] {
  const byDate = new Map(days.map((d) => [d.date, d.dues.filter((due) => matchesLine(due, line))]));
  return Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const dues = byDate.get(date) ?? [];
    return {
      date,
      dayOfMonth: i + 1,
      count: dues.length,
      totalPaise: dues.reduce((sum, due) => sum + due.amountPaise, 0),
      tone: worstTone(dues),
    };
  });
}

export function countByLine(days: DueDay[], line: string): number {
  return days.flatMap((d) => d.dues).filter((due) => matchesLine(due, line)).length;
}

/** First-letter weekday headings for Monday to Sunday, localised by Intl (no message keys). */
export function weekdayHeadings(lang: 'en' | 'hi'): string[] {
  const format = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'narrow', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

export function monthHeading(month: string, lang: 'en' | 'hi'): string {
  const [year, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, m - 1, 1)),
  );
}
