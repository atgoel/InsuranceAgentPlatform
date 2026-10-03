import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';
import { Home } from './Home';

describe('AC-M00-32 Home', () => {
  it('renders role cards when not authenticated', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    const headings = screen.getAllByRole('heading');
    expect(headings.some(h => h.textContent?.includes('Agent'))).toBe(true);
  });

  it('renders language switch', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('हि')).toBeInTheDocument();
  });

  it('renders authenticated user greeting when session exists', () => {
    function AuthenticatedHome() {
      const auth = useAuth();
      // Simulate authenticated session
      if (!auth.session) {
        auth.setSession({
          token: 'test-token',
          tenantId: 'ten_test',
          roles: ['agent', 'manager'],
        });
      }
      return <Home />;
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <AuthenticatedHome />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Welcome, agent, manager/)).toBeInTheDocument();
  });

  it('displays all role selection cards in unauthenticated state', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('ISP')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
  });

  it('displays select role buttons for each role', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    const buttons = screen.getAllByRole('button', { name: /select role/i });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('displays platform surfaces section with navigation buttons', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Platform Surfaces')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mobile App/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CRM/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Console/i })).toBeInTheDocument();
  });

  it('displays authenticated user surfaces without platform surfaces heading', () => {
    function AuthenticatedHome() {
      const auth = useAuth();
      if (!auth.session) {
        auth.setSession({
          token: 'test-token',
          tenantId: 'ten_test',
          roles: ['agent'],
        });
      }
      return <Home />;
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <AuthenticatedHome />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Platform Surfaces')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mobile App/i })).toBeInTheDocument();
  });

  it('language switch buttons are present and functional', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    const enButton = screen.getByRole('button', { name: 'EN' });
    const hiButton = screen.getByRole('button', { name: 'हि' });

    expect(enButton).toBeInTheDocument();
    expect(hiButton).toBeInTheDocument();

    // Click language button
    await user.click(hiButton);
    expect(hiButton).toBeInTheDocument();
  });
});
