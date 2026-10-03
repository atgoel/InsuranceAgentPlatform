import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '../../lib/auth';
import { ApiProvider, FetchApiClient } from '../../lib/api';

describe('AC-M00-32 LoginPage', () => {
  it('renders DevLogin component', () => {
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
    });

    render(
      <AuthProvider>
        <ApiProvider client={client}>
          <LoginPage />
        </ApiProvider>
      </AuthProvider>,
    );

    expect(screen.getByRole('heading', { name: /Select Your Role/i })).toBeInTheDocument();
  });

  it('displays role selection options', () => {
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
    });

    render(
      <AuthProvider>
        <ApiProvider client={client}>
          <LoginPage />
        </ApiProvider>
      </AuthProvider>,
    );

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
  });
});
