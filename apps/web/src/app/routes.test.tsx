import { describe, it, expect } from 'vitest';
import { routes } from './routes';

describe('AC-M00-32 Routes', () => {
  it('defines routes array', () => {
    expect(routes).toBeDefined();
    expect(Array.isArray(routes)).toBe(true);
  });

  it('has index route with Home component', () => {
    const indexRoute = routes.find(r => r.index);
    expect(indexRoute).toBeDefined();
    expect(indexRoute?.element).toBeDefined();
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

  it('has catch-all route for unknown paths', () => {
    const catchAllRoute = routes.find(r => r.path === '*');
    expect(catchAllRoute).toBeDefined();
  });
});
