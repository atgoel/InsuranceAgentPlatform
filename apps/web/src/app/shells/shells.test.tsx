import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../lib/api';
import { AuthProvider, setSession } from '../../lib/auth';
import { I18nProvider } from '../../lib/i18n';
import { messagesEn } from '../../lib/i18n/messages.en';
import { messagesHi } from '../../lib/i18n/messages.hi';
import { mockClient, type MockClient } from '../../test/render';
import { routes } from '../routes';
import { CONSOLE_NAV, CRM_NAV, MOBILE_NAV } from './nav';

const signOutMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/auth/oidc', () => ({
  signOut: signOutMock,
  signIn: vi.fn(),
  completeSignIn: vi.fn(),
  isOidcConfigured: () => false,
}));

const ALL = ['crm.lead.read', 'crm.opportunity.read', 'crm.task.read', 'crm.routing.read', 'crm.import', 'party.read', 'book.read'];
const ADMIN = ['tenant.read', 'tenant.brand.write', 'tenant.custom_field.write', 'integration.read', 'distribution.member.read', 'distribution.role.read'];
const TENANT = { id: 'ten_acme', slug: 'acme', displayName: 'Acme Insurance Brokers' };

function api(roles: string[], permissions: string[]): MockClient {
  return mockClient({
    '/api/v1/me': { userRef: 'usr_1', tenantId: 'ten_acme', roles, permissions },
    '/api/v1/tenant': TENANT,
  });
}

function renderApp(path: string, client: MockClient) {
  setSession({ token: 't', tenantId: 'ten_acme', roles: ['SALESPERSON'], name: 'Priya Sharma' });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <ApiProvider client={client}>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </ApiProvider>
    </AuthProvider>,
  );
  return router;
}

function linkTexts(nav: HTMLElement): (string | null)[] {
  return within(nav).getAllByRole('link').map((l) => l.textContent);
}

function linkTargets(nav: HTMLElement): (string | null)[] {
  return within(nav).getAllByRole('link').map((l) => l.getAttribute('href'));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
});

describe('AC-M00-32 MobileShell', () => {
  it('AC-M00-32 shows the tenant name, the five bottom-nav destinations and routes to each', async () => {
    const client = api(['SALESPERSON'], ALL);
    const router = renderApp('/m/unknown', client);
    expect(await screen.findByText('Acme Insurance Brokers')).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith('/api/v1/tenant');
    await screen.findByRole('link', { name: 'Book' });
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(linkTexts(nav)).toEqual(['Today', 'Leads', 'Customers', 'Book', 'Me']);
    expect(linkTargets(nav)).toEqual(['/m/today', '/m/leads', '/m/customers', '/m/book', '/m/me']);
    await userEvent.click(within(nav).getByRole('link', { name: 'Book' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/m/book'));
  });

  it('AC-M00-32 switches the language and stores the choice', async () => {
    renderApp('/m/unknown', api(['SALESPERSON'], ALL));
    const group = await screen.findByRole('group', { name: 'Language' });
    expect(within(group).getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'हि' }));
    const hindi = await screen.findByRole('group', { name: 'भाषा' });
    expect(within(hindi).getByRole('button', { name: 'हि' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'आज' })).toBeInTheDocument();
    expect(localStorage.getItem('ui-lang')).toBe('hi');
  });

  it('AC-M00-32 hides destinations the caller has no permission for', async () => {
    renderApp('/m/unknown', api(['SALESPERSON'], ['crm.lead.read']));
    await screen.findByRole('link', { name: 'Leads' });
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(linkTexts(nav)).toEqual(['Today', 'Leads', 'Me']);
  });

  it('AC-M00-32 avatar menu shows the user and role, and Sign out calls signOut once', async () => {
    renderApp('/m/unknown', api(['SALESPERSON'], ALL));
    const avatar = await screen.findByRole('button', { name: 'Account menu' });
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(avatar);
    expect(avatar).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Salesperson')).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma', { selector: 'p' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('AC-M00-32 a failed sign-out shows an inline alert and keeps the screen', async () => {
    signOutMock.mockRejectedValue(new Error('network'));
    renderApp('/m/unknown', api(['SALESPERSON'], ALL));
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out. Try again.');
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
  });

  it('AC-M00-32 /m/me opens the plan screen inside the shell, not a placeholder', async () => {
    renderApp('/m/me', api(['SOLO_OWNER'], ALL));
    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.queryByText('Me Shell')).not.toBeInTheDocument();
    expect(screen.queryByText('Coming in a later module')).not.toBeInTheDocument();
  });
});

describe('AC-M00-32 CrmShell', () => {
  it('AC-M00-32 shows tenant, user and role line, grouped sections and the Coming soon badge', async () => {
    renderApp('/crm/unknown', api(['BRANCH_MANAGER'], ALL));
    expect(await screen.findByText('Acme Insurance Brokers')).toBeInTheDocument();
    expect(screen.getByText('Priya Sharma', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByText('Branch manager')).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Pipeline' });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(linkTargets(nav)).toEqual([
      '/crm/leads',
      '/crm/pipeline',
      '/crm/customers',
      '/crm/tasks',
      '/crm/campaigns',
      '/crm/routing',
      '/crm/import',
    ]);
    const campaigns = within(nav).getByRole('link', { name: /Campaigns/ });
    expect(within(campaigns).getByText('Coming soon')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Pipeline' })).not.toHaveTextContent('Coming soon');
  });

  it('AC-M00-32 a Coming soon entry opens the later-module empty state inside the shell', async () => {
    renderApp('/crm/unknown', api(['BRANCH_MANAGER'], ALL));
    await userEvent.click(await screen.findByRole('link', { name: /Campaigns/ }));
    expect(await screen.findByRole('heading', { name: 'Coming in a later module' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
  });

  it('AC-M00-32 sections collapse and expand', async () => {
    renderApp('/crm/unknown', api(['BRANCH_MANAGER'], ALL));
    const toggle = await screen.findByRole('button', { name: 'Sales' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: 'Pipeline' })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Pipeline' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Routing' })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByRole('link', { name: 'Pipeline' })).toBeInTheDocument();
  });

  it('AC-M00-32 the search box filters the entries and says when nothing matches', async () => {
    renderApp('/crm/unknown', api(['BRANCH_MANAGER'], ALL));
    const search = await screen.findByRole('searchbox', { name: 'Search menu' });
    await screen.findByRole('link', { name: 'Pipeline' });
    await userEvent.type(search, 'pipe');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(linkTexts(nav)).toEqual(['Pipeline']);
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(screen.getByText('No matching entries')).toBeInTheDocument();
    expect(within(nav).queryAllByRole('link')).toEqual([]);
  });

  it('AC-M00-32 entries without the permission are hidden', async () => {
    renderApp('/crm/unknown', api(['SALESPERSON'], ['crm.lead.read', 'crm.task.read']));
    await screen.findByRole('link', { name: 'Leads' });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(linkTexts(nav)).toEqual(['Leads', 'Tasks', 'CampaignsComing soon']);
  });

  it('AC-M00-32 a failed permissions call shows an inline alert and keeps the permission-free entries', async () => {
    const client = mockClient({ '/api/v1/me': new Error('boom'), '/api/v1/tenant': TENANT });
    renderApp('/crm/unknown', client);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your permissions');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(linkTexts(nav)).toEqual(['CampaignsComing soon']);
  });

  it('AC-M00-32 Sign out in the sidebar calls signOut', async () => {
    renderApp('/crm/unknown', api(['BRANCH_MANAGER'], ALL));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('AC-M00-32 the sidebar language switch re-renders the entries in Hindi', async () => {
    renderApp('/crm/unknown', api(['BRANCH_MANAGER'], ALL));
    await userEvent.click(await screen.findByRole('button', { name: 'हि' }));
    expect(await screen.findByRole('link', { name: 'पाइपलाइन' })).toBeInTheDocument();
    expect(localStorage.getItem('ui-lang')).toBe('hi');
  });
});

describe('AC-M00-32 ConsoleShell', () => {
  it('AC-M00-32 lists the console entries by permission and marks unbuilt modules Coming soon', async () => {
    renderApp('/console/content', api(['TENANT_ADMIN'], ADMIN));
    expect(await screen.findByRole('heading', { name: 'Coming in a later module' })).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Tenant' });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(linkTargets(nav)).toEqual([
      '/console/dashboard',
      '/console/onboarding',
      '/console/users-roles',
      '/console/tenant',
      '/console/brand',
      '/console/custom-fields',
      '/console/integrations',
      '/console/content',
      '/console/reports',
      '/console/compliance',
      '/console/commission',
      '/console/ai-controls',
    ]);
    const commission = within(nav).getByRole('link', { name: /Commission/ });
    expect(within(commission).getByText('Coming soon')).toBeInTheDocument();
  });

  it('AC-M00-32 a principal officer without brand permission does not see Brand or Integrations', async () => {
    renderApp('/console/content', api(['PRINCIPAL_OFFICER'], ['tenant.read', 'distribution.member.read', 'distribution.role.read']));
    await screen.findByRole('link', { name: 'Tenant' });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).queryByRole('link', { name: 'Brand' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
  });

  it('AC-M00-32 the console sidebar has no Operator tenants entry or Platform section, even for an operator', async () => {
    renderApp('/console/content', api(['platform.operator'], ['ops.*']));
    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    expect(within(nav).queryByRole('link', { name: 'Operator tenants' })).not.toBeInTheDocument();
    expect(within(nav).queryByText('Platform')).not.toBeInTheDocument();
    expect(CONSOLE_NAV.filter((entry) => entry.to === '/console/ops/tenants')).toEqual([]);
  });

  it('AC-M00-32 unknown routes outside the shells show the later-module empty state', async () => {
    renderApp('/nonexistent', api(['TENANT_ADMIN'], ADMIN));
    expect(await screen.findByRole('heading', { name: 'Coming in a later module' })).toBeInTheDocument();
  });
});

describe('AC-M00-32 nav catalogue', () => {
  it('AC-M00-32 every nav label and section has an English and a Hindi message', () => {
    const keys = [...MOBILE_NAV, ...CRM_NAV, ...CONSOLE_NAV].flatMap((e) => [e.labelKey, e.section].filter(Boolean));
    expect(keys.filter((k) => !(k in messagesEn))).toEqual([]);
    expect(keys.filter((k) => !(k in messagesHi))).toEqual([]);
  });
});
