import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { clearSession, getSession, setSession, type Session } from './session';

let manager: UserManager | undefined;

export function isOidcConfigured(): boolean {
  return Boolean(import.meta.env.VITE_OIDC_AUTHORITY) && Boolean(import.meta.env.VITE_OIDC_CLIENT_ID);
}

function createManager(): UserManager {
  const origin = window.location.origin;
  const created = new UserManager({
    authority: String(import.meta.env.VITE_OIDC_AUTHORITY),
    client_id: String(import.meta.env.VITE_OIDC_CLIENT_ID),
    redirect_uri: `${origin}/auth/callback`,
    post_logout_redirect_uri: `${origin}/login`,
    response_type: 'code',
    scope: 'openid profile',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
  created.events.addUserLoaded(onUserLoaded);
  return created;
}

function getManager(): UserManager {
  manager ??= createManager();
  return manager;
}

function decodePayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

function toSession(user: User): Session {
  const claims = decodePayload(user.access_token);
  const roles = Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === 'string') : [];
  const tenantId = typeof claims.org === 'string' ? claims.org : '';
  return { token: user.access_token, tenantId, roles };
}

function onUserLoaded(user: User): void {
  const current = getSession();
  if (!current) return;
  setSession({ ...current, token: user.access_token });
}

export async function signIn(loginHint?: string): Promise<void> {
  await getManager().signinRedirect(loginHint ? { extraQueryParams: { login_hint: loginHint } } : undefined);
}

export async function completeSignIn(): Promise<Session> {
  const user = await getManager().signinRedirectCallback();
  const session = toSession(user);
  setSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  clearSession();
  await getManager().signoutRedirect();
}
