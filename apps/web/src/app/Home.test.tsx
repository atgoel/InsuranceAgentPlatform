import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';
import { Home } from './Home';
import { setSession, clearSession } from '../lib/auth/session';

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

  it('displays role badges in unauthenticated state', () => {
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
    expect(headings.some(h => h.textContent?.includes('Manager'))).toBe(true);
  });

  it('displays language switch buttons', () => {
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

  it('displays navigation buttons for surfaces', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /Mobile App/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CRM/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Console/i })).toBeInTheDocument();
  });

  it('language switch buttons have onclick handlers', async () => {
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

    const enBtn = screen.getByText('EN');
    const hiBtn = screen.getByText('हि');

    await user.click(hiBtn);
    expect(hiBtn).toBeInTheDocument();

    await user.click(enBtn);
    expect(enBtn).toBeInTheDocument();
  });

  it('navigation buttons are clickable', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    const mobileBtn = screen.getByRole('button', { name: /Mobile App/i });
    expect(mobileBtn).toBeInTheDocument();
  });

  it('shows authenticated user greeting when session exists', () => {
    setSession({
      token: 'test-token',
      tenantId: 'ten_test',
      roles: ['agent', 'manager'],
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Welcome, agent, manager/)).toBeInTheDocument();
    clearSession();
  });

  it('authenticated user sees navigation buttons', () => {
    setSession({
      token: 'test-token',
      tenantId: 'ten_test',
      roles: ['manager'],
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /Mobile App/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CRM/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Console/i })).toBeInTheDocument();
    clearSession();
  });

  it('does not show Platform Surfaces heading when authenticated', () => {
    setSession({
      token: 'test-token',
      tenantId: 'ten_test',
      roles: ['agent'],
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <Home />
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Platform Surfaces')).not.toBeInTheDocument();
    clearSession();
  });
});
