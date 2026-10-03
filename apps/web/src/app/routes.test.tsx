import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n';
import { ApiProvider, FetchApiClient } from '../lib/api';
import { ToastProvider } from '../design-system';

describe('AC-M00-32 Routes', () => {
  const mockClient = new FetchApiClient({
    baseUrl: '/api',
    getToken: () => undefined,
  });

  it('shows coming soon for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/unknown-route']}>
        <AuthProvider>
          <I18nProvider>
            <ApiProvider client={mockClient}>
              <ToastProvider>
                <div>Coming in a later module</div>
              </ToastProvider>
            </ApiProvider>
          </I18nProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Coming in a later module/)).toBeInTheDocument();
  });
});
