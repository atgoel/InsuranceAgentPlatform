import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';
import { ApiProvider, FetchApiClient } from '../lib/api';
import { ToastProvider } from '../design-system';
import { App } from './App';

describe('AC-M00-32 App', () => {
  const mockClient = new FetchApiClient({
    baseUrl: '/api',
    getToken: () => undefined,
  });

  it('redirects to the sign-in page when not authenticated', async () => {
    render(
      <AuthProvider>
        <I18nProvider>
          <ApiProvider client={mockClient}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ApiProvider>
        </I18nProvider>
      </AuthProvider>,
    );
    expect(await screen.findByText('Sign-in is not configured')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
