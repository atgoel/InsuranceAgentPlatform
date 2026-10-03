import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';
import { ApiProvider, FetchApiClient } from '../lib/api';
import { ToastProvider } from '../design-system';
import { routes } from './routes';

describe('AC-M00-32 Routes', () => {
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

  it('renders coming soon for unknown mobile path', () => {
    renderWithRouter(['/m/unknown']);
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
  });

  it('renders coming soon for crm path', () => {
    renderWithRouter(['/crm']);
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
  });

  it('renders catch-all for completely unknown route', () => {
    renderWithRouter(['/nonexistent']);
    expect(screen.getByText('Coming in a later module')).toBeInTheDocument();
  });
});
