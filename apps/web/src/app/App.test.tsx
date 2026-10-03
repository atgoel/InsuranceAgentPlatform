import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

  it('shows login when not authenticated', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <I18nProvider>
            <ApiProvider client={mockClient}>
              <ToastProvider>
                <App />
              </ToastProvider>
            </ApiProvider>
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    // DevLogin should show
    expect(screen.getByText(/Select Your Role/)).toBeInTheDocument();
  });
});
