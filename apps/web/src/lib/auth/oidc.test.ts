import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeJwt, oidcMock } from '../../test/oidc-mock';

vi.mock('oidc-client-ts', async () => {
  const { oidcMock } = await import('../../test/oidc-mock');
  return {
    UserManager: class {
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

  it('AC-M00-32 completeSignIn tolerates a token without roles', async () => {
    const token = fakeJwt({ org: 'ten_acme' });
    oidcMock.signinRedirectCallback.mockResolvedValue({ access_token: token });
    expect((await completeSignIn()).roles).toEqual([]);
  });

  it('AC-M00-32 signIn passes the login hint and signOut clears the session first', async () => {
    await signIn('priya.sales');
    expect(oidcMock.signinRedirect).toHaveBeenCalledWith({ extraQueryParams: { login_hint: 'priya.sales' } });
    await signIn();
    expect(oidcMock.signinRedirect).toHaveBeenLastCalledWith(undefined);
    setSession({ token: 't', tenantId: 'x', roles: [] });
    await signOut();
    expect(getSession()).toBeUndefined();
    expect(oidcMock.signoutRedirect).toHaveBeenCalledTimes(1);
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
