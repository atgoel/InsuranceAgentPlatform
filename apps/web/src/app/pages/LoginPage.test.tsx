import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { oidcMock } from '../../test/oidc-mock';

vi.mock('oidc-client-ts', async () => {
  const { oidcMock } = await import('../../test/oidc-mock');
  return {
    UserManager: class {
      events = { addUserLoaded: oidcMock.addUserLoaded };
      signinRedirect = oidcMock.signinRedirect;
    },
    WebStorageStateStore: class {},
  };
});

import { renderWithAuth } from '../../test/renderAuth';
import { LoginPage } from './LoginPage';

function configure(demo: boolean) {
  vi.stubEnv('VITE_OIDC_AUTHORITY', 'http://kc/realms/iap');
  vi.stubEnv('VITE_OIDC_CLIENT_ID', 'iap-web');
  vi.stubEnv('VITE_DEMO_LOGIN', demo ? '1' : '');
}

describe('AC-M00-32 LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    oidcMock.signinRedirect.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('AC-M00-32 demo mode lists the five personas and the demo password', () => {
    configure(true);
    renderWithAuth(<LoginPage />, '/login');
    const select = screen.getByLabelText('Demo persona');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      'Priya Sharma — Salesperson',
      'Rahul Verma — Branch manager',
      'Anita Rao — Tenant admin',
      'Vikram Iyer — Principal officer',
      'Meera Nair — Operations',
    ]);
    expect(screen.getByText('Username priya.sales · password Demo@1234')).toBeInTheDocument();
  });

  it('AC-M00-32 sign in sends the selected persona as login_hint', async () => {
    configure(true);
    renderWithAuth(<LoginPage />, '/login');
    await userEvent.selectOptions(screen.getByLabelText('Demo persona'), 'rahul.manager');
    expect(screen.getByText('Username rahul.manager · password Demo@1234')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(oidcMock.signinRedirect).toHaveBeenCalledWith({ extraQueryParams: { login_hint: 'rahul.manager' } });
  });

  it('AC-M00-32 without demo mode there is no persona dropdown and no login hint', async () => {
    configure(false);
    renderWithAuth(<LoginPage />, '/login');
    expect(screen.queryByLabelText('Demo persona')).not.toBeInTheDocument();
    expect(screen.getByText('Insurance Agent Platform')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(oidcMock.signinRedirect).toHaveBeenCalledWith(undefined);
  });

  it('AC-M00-32 hero band holds the product name as the page heading and the pitch', () => {
    configure(false);
    renderWithAuth(<LoginPage />, '/login');
    const hero = screen.getByRole('banner');
    expect(within(hero).getByRole('heading', { level: 1, name: 'Insurance Agent Platform' })).toBeInTheDocument();
    expect(within(hero).getByText('Sign in to manage your leads, customers and policy book.')).toBeInTheDocument();
    expect(within(hero).queryByRole('button')).not.toBeInTheDocument();
  });

  it('AC-M00-32 shows the not-configured error when the authority is missing', () => {
    vi.stubEnv('VITE_OIDC_AUTHORITY', '');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', '');
    renderWithAuth(<LoginPage />, '/login');
    expect(screen.getByText('Sign-in is not configured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('AC-M00-32 an existing session goes straight to its role home', async () => {
    configure(false);
    sessionStorage.setItem('iap_session', JSON.stringify({ token: 't', tenantId: 'x', roles: ['BRANCH_MANAGER'] }));
    renderWithAuth(<LoginPage />, '/login');
    expect(await screen.findByTestId('location')).toHaveTextContent('/crm/leads');
  });
});
