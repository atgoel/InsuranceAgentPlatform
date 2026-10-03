import { createHmac } from 'crypto';

/**
 * AC-M00-* (tenancy): pseudonymiseActor
 * Generates a pseudonym for an actor (user) using HMAC-SHA256.
 * The pseudonym is a deterministic hash-based identifier that allows
 * logging and audit without exposing the original user ID.
 * Format: 'usr_' + first 12 hex chars of HMAC-SHA256(pepper, userRef)
 */
export function pseudonymiseActor(userRef: string, pepper: string): string {
  const hmac = createHmac('sha256', pepper);
  hmac.update(userRef);
  const hash = hmac.digest('hex');
  return 'usr_' + hash.substring(0, 12);
}
