import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';
import { ApiProvider, FetchApiClient } from '../lib/api';
import { ToastProvider } from '../design-system';
import { routes } from './routes';

describe('AC-M00-32 Routes', () => {
  function renderRouter(router: ReturnType<typeof createMemoryRouter>) {
    const client = new FetchApiClient({ baseUrl: '/api', getToken: () => undefined });
    return render(
      <AuthProvider>
        <ApiProvider client={client}>
          <I18nProvider>
            <RouterProvider router={router} />
          </I18nProvider>
        </ApiProvider>
      </AuthProvider>,
    );
  }

  function renderWithRouter(initialEntries?: string[]) {
    const router = createMemoryRouter(routes, { initialEntries: initialEntries || ['/'] });
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
    });

    return render(
      <AuthProvider>
        <ApiProvider client={client}>
          <I18nProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </I18nProvider>
        </ApiProvider>
      </AuthProvider>,
    );
  }

  it('AC-M07-15 mobile and CRM shells render their nested screen without technical labels', async () => {
    const shellRoutes = ['m', 'crm'].map(path => ({
      element: routes.find(route => route.path === path)?.element,
      path,
      children: [{ path: 'probe', element: <div>{path} child screen</div> }],
    }));
    const mobile = renderRouter(createMemoryRouter(shellRoutes, { initialEntries: ['/m/probe'] }));
    expect(await screen.findByText('m child screen')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.queryByText('Mobile Shell')).not.toBeInTheDocument();
    mobile.unmount();
    renderRouter(createMemoryRouter(shellRoutes, { initialEntries: ['/crm/probe'] }));
    expect(await screen.findByText('crm child screen')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.queryByText('CRM Shell')).not.toBeInTheDocument();
  });
  it('defines routes array', () => {
    expect(routes).toBeDefined();
    expect(Array.isArray(routes)).toBe(true);
  });

  it('has index route with Home component', () => {
    const indexRoute = routes.find(r => r.index);
    expect(indexRoute).toBeDefined();
    expect(indexRoute?.element).toBeDefined();
  });

  it('renders Home on root path', () => {
    renderWithRouter(['/']);
    // Home should render role cards
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  it('has login route', () => {
    const loginRoute = routes.find(r => r.path === 'login');
    expect(loginRoute).toBeDefined();
    expect(loginRoute?.lazy).toBeDefined();
  });

  it('has signup route', () => {
    const signupRoute = routes.find(r => r.path === 'signup');
    expect(signupRoute).toBeDefined();
    expect(signupRoute?.lazy).toBeDefined();
  });

  it('has mobile routes', () => {
    const mRoute = routes.find(r => r.path === 'm');
    expect(mRoute).toBeDefined();
    expect(mRoute?.children).toBeDefined();
    expect(mRoute?.children?.length).toBeGreaterThan(0);
  });

  it('mobile routes contain nested paths', () => {
    const mRoute = routes.find(r => r.path === 'm');
    const childPaths = mRoute?.children?.map(c => c.path);
    expect(childPaths).toContain('today');
    expect(childPaths).toContain('leads');
    expect(childPaths).toContain('customers');
    expect(childPaths).toContain('book');
    expect(childPaths).toContain('me');
  });

  it('mobile me route has plan nested child', () => {
    const mRoute = routes.find(r => r.path === 'm');
    const meRoute = mRoute?.children?.find(c => c.path === 'me');
    expect(meRoute?.children?.map(c => c.path)).toContain('plan');
  });

  it('has crm routes', () => {
    const crmRoute = routes.find(r => r.path === 'crm');
    expect(crmRoute).toBeDefined();
    expect(crmRoute?.children).toBeDefined();
  });

  it('has console routes', () => {
    const consoleRoute = routes.find(r => r.path === 'console');
    expect(consoleRoute).toBeDefined();
    expect(consoleRoute?.children).toBeDefined();
  });

  it('console routes contain nested paths', () => {
    const consoleRoute = routes.find(r => r.path === 'console');
    const childPaths = consoleRoute?.children?.map(c => c.path);
    expect(childPaths).toContain('tenant');
    expect(childPaths).toContain('brand');
    expect(childPaths).toContain('ops');
  });

  it('console ops route has tenants child', () => {
    const consoleRoute = routes.find(r => r.path === 'console');
    const opsRoute = consoleRoute?.children?.find(c => c.path === 'ops');
    expect(opsRoute?.children?.map(c => c.path)).toContain('tenants');
  });

  it('has catch-all route for unknown paths', () => {
    const catchAllRoute = routes.find(r => r.path === '*');
    expect(catchAllRoute).toBeDefined();
  });

  it('renders coming soon for mobile catch-all path', () => {
    renderWithRouter(['/m/unknown']);
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
  });

  it('renders mobile shell for nested routes', async () => {
    renderWithRouter(['/m/today']);
    expect(screen.queryByText('Mobile Shell')).not.toBeInTheDocument();
  });

  it('renders crm shell placeholder', () => {
    renderWithRouter(['/crm']);
    expect(screen.queryByText('CRM Shell')).not.toBeInTheDocument();
  });

  it('renders the console shell sidebar, not a placeholder', async () => {
    renderWithRouter(['/console/unknown']);
    expect(await screen.findByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.queryByText('Console Shell')).not.toBeInTheDocument();
  });

  it('renders catch-all for completely unknown route', () => {
    renderWithRouter(['/nonexistent']);
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
  });

  it('renders mobile leads nested route', async () => {
    renderWithRouter(['/m/leads']);
    expect(screen.queryByText('Mobile Shell')).not.toBeInTheDocument();
  });

  it('mobile customers routes render the party screens inside the mobile shell', () => {
    const mRoute = routes.find(r => r.path === 'm');
    const customers = mRoute?.children?.find(c => c.path === 'customers');
    const record = mRoute?.children?.find(c => c.path === 'customers/:id');
    expect(customers?.lazy).toBeDefined();
    expect(record?.lazy).toBeDefined();
  });

  it('renders mobile book nested route', async () => {
    renderWithRouter(['/m/book']);
    expect(screen.queryByText('Mobile Shell')).not.toBeInTheDocument();
  });
});
