/**
 * India Standard Time calendar helpers (fixed +05:30; India has no DST). Business dates in this platform are IST
 * calendar dates; never use Date#setHours/getDate, which follow the server's local timezone.
 */
export const IST_OFFSET_MS = 330 * 60_000;

/** The IST calendar date of an instant, as YYYY-MM-DD. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start (00:00 IST) of the IST calendar day containing `at`. */
export function istDayStart(at: Date): Date {
  return istAt(istDate(at), 0, 0);
}

/** The instant of hh:mm IST on an IST calendar date (YYYY-MM-DD). */
export function istAt(date: string, hours: number, minutes: number): Date {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + (hours * 60 + minutes) * 60_000 - IST_OFFSET_MS);
}

/** A calendar date (YYYY-MM-DD) plus whole days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}
