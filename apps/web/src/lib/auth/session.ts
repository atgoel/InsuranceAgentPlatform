/**
 * Session management in sessionStorage
 */
export interface Session {
  token: string;
  tenantId: string;
  roles: string[];
  /** Display name from the token claims `name` or `preferred_username`; absent when the token carries neither. */
  name?: string;
}

const SESSION_KEY = 'iap_session';

export function getSession(): Session | undefined {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : undefined;
  } catch {
    return undefined;
  }
}

export function setSession(session: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage not available
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // sessionStorage not available
  }
}

export function getToken(): string | undefined {
  return getSession()?.token;
}
