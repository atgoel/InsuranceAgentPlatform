import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { getRuntimeConfig } from '../config';
import { clearSession, getSession, setSession, type Session } from './session';

let manager: UserManager | undefined;

export function isOidcConfigured(): boolean {
  const { oidcAuthority, oidcClientId } = getRuntimeConfig();
  return Boolean(oidcAuthority) && Boolean(oidcClientId);
}

function createManager(): UserManager {
  const origin = window.location.origin;
  const { oidcAuthority, oidcClientId } = getRuntimeConfig();
  const created = new UserManager({
    authority: String(oidcAuthority),
    client_id: String(oidcClientId),
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

function displayNameFrom(claims: Record<string, unknown>): string | undefined {
  if (typeof claims.name === 'string' && claims.name) return claims.name;
  if (typeof claims.preferred_username === 'string' && claims.preferred_username) return claims.preferred_username;
  return undefined;
}

function toSession(user: User): Session {
  const claims = decodePayload(user.access_token);
  const roles = Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === 'string') : [];
  const tenantId = typeof claims.org === 'string' ? claims.org : '';
  const name = displayNameFrom(claims);
  return name ? { token: user.access_token, tenantId, roles, name } : { token: user.access_token, tenantId, roles };
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

/** Always ends the app session locally; Keycloak end-session is best effort (ADR-010 decision 4). */
export async function signOut(): Promise<void> {
  const oidc = getManager();
  const user = await oidc.getUser();
  const idToken = user?.id_token;
  await oidc.removeUser();
  clearSession();
  try {
    await oidc.signoutRedirect(idToken ? { id_token_hint: idToken } : undefined);
  } catch {
    window.location.assign('/login');
  }
}
