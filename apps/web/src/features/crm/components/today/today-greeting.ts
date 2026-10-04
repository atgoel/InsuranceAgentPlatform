import { getToken } from '../../../../lib/auth';

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening';

/** Greeting period from the hour in India, whatever the device timezone is. */
export function greetingPeriod(now: Date): GreetingPeriod {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now),
  );
  if (hour < 12) return 'morning';
  return hour < 17 ? 'afternoon' : 'evening';
}

function payloadOf(token: string): unknown {
  const part = token.split('.')[1];
  if (!part) return undefined;
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** First name from the `name` claim of the signed-in token; undefined when the token has none (the greeting then omits it). */
export function firstNameFromToken(token: string | undefined = getToken()): string | undefined {
  if (!token) return undefined;
  try {
    const claim = (payloadOf(token) as { name?: unknown } | undefined)?.name;
    const first = typeof claim === 'string' ? claim.trim().split(/\s+/)[0] : undefined;
    return first || undefined;
  } catch {
    return undefined;
  }
}
