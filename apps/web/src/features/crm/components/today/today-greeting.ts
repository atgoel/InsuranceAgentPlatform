import { getSession, type Session } from '../../../../lib/auth';

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening';

/** Greeting period from the hour in India, whatever the device timezone is. */
export function greetingPeriod(now: Date): GreetingPeriod {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now),
  );
  if (hour < 12) return 'morning';
  return hour < 17 ? 'afternoon' : 'evening';
}

/** First word of the signed-in user's display name (`Session.name`); undefined when there is none (the greeting then omits it). */
export function firstNameOf(session: Session | undefined = getSession()): string | undefined {
  const first = session?.name?.trim().split(/\s+/)[0];
  return first || undefined;
}
