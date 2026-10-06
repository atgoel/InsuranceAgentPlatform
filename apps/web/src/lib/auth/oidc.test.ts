import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeJwt, oidcMock } from '../../test/oidc-mock';

const settings = vi.hoisted(() => ({ last: undefined as unknown }));
const OIDC_USER_KEY = 'oidc.user:test';
const storedUser = vi.hoisted(() => ({
  get: vi.fn(async () => {
    const raw = sessionStorage.getItem('oidc.user:test');
    return raw ? (JSON.parse(raw) as { id_token: string }) : null;
  }),
  remove: vi.fn(async () => sessionStorage.removeItem('oidc.user:test')),
}));

vi.mock('oidc-client-ts', async () => {
  const { oidcMock } = await import('../../test/oidc-mock');
  return {
    UserManager: class {
      getUser = storedUser.get;
      removeUser = storedUser.remove;
      events = { addUserLoaded: oidcMock.addUserLoaded };
      signinRedirect = oidcMock.signinRedirect;
      signinRedirectCallback = oidcMock.signinRedirectCallback;
      signoutRedirect = oidcMock.signoutRedirect;
    },
    WebStorageStateStore: class {},
  };
});

import { completeSignIn, isOidcConfigured, signIn, signOut } from './oidc';
import { getSession, setSession } from './session';

describe('AC-M00-32 oidc', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv('VITE_OIDC_AUTHORITY', 'http://kc/realms/iap');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'iap-web');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('AC-M00-32 completeSignIn stores the session from the org and roles claims', async () => {
    const token = fakeJwt({ org: 'ten_acme', roles: ['SALESPERSON', 'OPS'] });
    oidcMock.signinRedirectCallback.mockResolvedValue({ access_token: token });
    const session = await completeSignIn();
    expect(session).toEqual({ token, tenantId: 'ten_acme', roles: ['SALESPERSON', 'OPS'] });
    expect(JSON.parse(sessionStorage.getItem('iap_session') ?? '')).toEqual({
      token,
      tenantId: 'ten_acme',
      roles: ['SALESPERSON', 'OPS'],
    });
  });

  it('AC-M00-32 completeSignIn keeps the display name from the name claim', async () => {
    const token = fakeJwt({ org: 'ten_acme', roles: ['SALESPERSON'], name: 'Priya Sharma', preferred_username: 'priya.sales' });
    oidcMock.signinRedirectCallback.mockResolvedValue({ access_token: token });
    expect(await completeSignIn()).toEqual({ token, tenantId: 'ten_acme', roles: ['SALESPERSON'], name: 'Priya Sharma' });
  });

  it('AC-M00-32 completeSignIn tolerates a token without roles', async () => {
    const token = fakeJwt({ org: 'ten_acme' });
    oidcMock.signinRedirectCallback.mockResolvedValue({ access_token: token });
    expect((await completeSignIn()).roles).toEqual([]);
  });

  it('AC-M00-32 signIn passes the login hint', async () => {
    await signIn('priya.sales');
    expect(oidcMock.signinRedirect).toHaveBeenCalledWith({ extraQueryParams: { login_hint: 'priya.sales' } });
    await signIn();
    expect(oidcMock.signinRedirect).toHaveBeenLastCalledWith(undefined);
  });

  it('AC-M00-32 silent renew replaces the stored token', async () => {
    vi.resetModules();
    const fresh = await import('./oidc');
    await fresh.signIn();
    const onLoaded = oidcMock.addUserLoaded.mock.calls[0][0] as (user: { access_token: string }) => void;
    setSession({ token: 'old', tenantId: 'ten_acme', roles: ['OPS'] });
    onLoaded({ access_token: 'new' });
    expect(getSession()).toEqual({ token: 'new', tenantId: 'ten_acme', roles: ['OPS'] });
  });

  it('AC-M00-32 reports whether the authority and client are configured', () => {
    expect(isOidcConfigured()).toBe(true);
    vi.stubEnv('VITE_OIDC_CLIENT_ID', '');
    expect(isOidcConfigured()).toBe(false);
  });
});

describe('AC-M00-37 oidc runtime config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_OIDC_AUTHORITY', 'http://build/realms/iap');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'build-client');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__IAP_CONFIG__;
  });

  it('AC-M00-37 isOidcConfigured follows window.__IAP_CONFIG__ per field', async () => {
    vi.stubEnv('VITE_OIDC_AUTHORITY', '');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', '');
    const fresh = await import('./oidc');
    expect(fresh.isOidcConfigured()).toBe(false);
    window.__IAP_CONFIG__ = { oidcAuthority: 'https://run/realms/iap' };
    expect(fresh.isOidcConfigured()).toBe(false);
    window.__IAP_CONFIG__ = { oidcAuthority: 'https://run/realms/iap', oidcClientId: 'run-client' };
    expect(fresh.isOidcConfigured()).toBe(true);
  });

  it('AC-M00-37 the UserManager gets the runtime authority and client id, not the VITE ones', async () => {
    vi.doMock('oidc-client-ts', () => ({
      UserManager: class {
        events = { addUserLoaded: vi.fn() };
        signinRedirect = vi.fn();
        constructor(options: unknown) {
          settings.last = options;
        }
      },
      WebStorageStateStore: class {},
    }));
    window.__IAP_CONFIG__ = { oidcAuthority: 'https://run/realms/iap', oidcClientId: 'run-client' };
    const fresh = await import('./oidc');
    await fresh.signIn();
    expect(settings.last).toMatchObject({ authority: 'https://run/realms/iap', client_id: 'run-client' });
    vi.doUnmock('oidc-client-ts');
  });
});

describe('AC-M00-38 oidc signOut', () => {
  const assign = vi.fn();
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv('VITE_OIDC_AUTHORITY', 'http://kc/realms/iap');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'iap-web');
    vi.stubGlobal('location', { origin: window.location.origin, assign });
    oidcMock.signoutRedirect.mockResolvedValue(undefined);
    sessionStorage.setItem(OIDC_USER_KEY, JSON.stringify({ id_token: 'idt-1' }));
    setSession({ token: 't', tenantId: 'x', roles: [] });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('AC-M00-38 removes the stored user and the session and passes the id token as id_token_hint', async () => {
    await signOut();
    expect(sessionStorage.getItem(OIDC_USER_KEY)).toBeNull();
    expect(sessionStorage.getItem('iap_session')).toBeNull();
    expect(oidcMock.signoutRedirect).toHaveBeenCalledTimes(1);
    expect(oidcMock.signoutRedirect).toHaveBeenCalledWith({ id_token_hint: 'idt-1' });
    expect(assign).not.toHaveBeenCalled();
  });

  it('AC-M00-38 when the end-session redirect rejects, goes to /login and stays signed out', async () => {
    oidcMock.signoutRedirect.mockRejectedValue(new Error('metadata unreachable'));
    await expect(signOut()).resolves.toBeUndefined();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/login');
    expect(sessionStorage.length).toBe(0);
  });
});
