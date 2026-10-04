import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeJwt, oidcMock } from '../../test/oidc-mock';

vi.mock('oidc-client-ts', async () => {
  const { oidcMock } = await import('../../test/oidc-mock');
  return {
    UserManager: class {
      events = { addUserLoaded: oidcMock.addUserLoaded };
      signinRedirectCallback = oidcMock.signinRedirectCallback;
    },
    WebStorageStateStore: class {},
  };
});

import { renderWithAuth } from '../../test/renderAuth';
import { AuthCallback } from './AuthCallback';

describe('AC-M00-32 AuthCallback', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv('VITE_OIDC_AUTHORITY', 'http://kc/realms/iap');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'iap-web');
  });

  it('AC-M00-32 stores the session from the token claims and routes to the persona home', async () => {
    const token = fakeJwt({ org: 'ten_acme', roles: ['TENANT_ADMIN'] });
    oidcMock.signinRedirectCallback.mockResolvedValue({ access_token: token });
    renderWithAuth(<AuthCallback />, '/auth/callback');
    expect(await screen.findByTestId('location')).toHaveTextContent('/console/tenant');
    expect(JSON.parse(sessionStorage.getItem('iap_session') ?? '')).toEqual({
      token,
      tenantId: 'ten_acme',
      roles: ['TENANT_ADMIN'],
    });
    expect(oidcMock.signinRedirectCallback).toHaveBeenCalledTimes(1);
  });

  it('AC-M00-32 an unknown role lands on the root', async () => {
    oidcMock.signinRedirectCallback.mockResolvedValue({ access_token: fakeJwt({ org: 'ten_acme', roles: ['MYSTERY'] }) });
    renderWithAuth(<AuthCallback />, '/auth/callback');
    expect(await screen.findByTestId('location')).toHaveTextContent('/');
  });

  it('AC-M00-32 a failed callback shows an error with a way back to sign-in', async () => {
    oidcMock.signinRedirectCallback.mockRejectedValue(new Error('bad state'));
    renderWithAuth(<AuthCallback />, '/auth/callback');
    expect(await screen.findByText('Sign-in failed. Please try again.')).toBeInTheDocument();
    expect(sessionStorage.getItem('iap_session')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to sign-in' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/login');
  });
});
