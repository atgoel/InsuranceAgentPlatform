import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevLogin } from './dev-login';
import { AuthProvider } from './auth-provider';
import { ApiProvider, FetchApiClient } from '../api';

describe('AC-M00-32 DevLogin', () => {
  it('renders role buttons', () => {
    const mockFetch = vi.fn();
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    render(
      <AuthProvider>
        <ApiProvider client={client}>
          <DevLogin />
        </ApiProvider>
      </AuthProvider>,
    );

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('ISP')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
  });

  it('renders login button', () => {
    const mockFetch = vi.fn();
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    render(
      <AuthProvider>
        <ApiProvider client={client}>
          <DevLogin />
        </ApiProvider>
      </AuthProvider>,
    );

    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('selects role on click', async () => {
    const mockFetch = vi.fn();
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ApiProvider client={client}>
          <DevLogin />
        </ApiProvider>
      </AuthProvider>,
    );

    const agentButton = screen.getAllByRole('button').find(b => b.textContent === 'Agent');
    if (agentButton) {
      await user.click(agentButton);
      // Check that the button was selected
      expect(agentButton.classList.contains('selected')).toBe(true);
    }
  });
});
