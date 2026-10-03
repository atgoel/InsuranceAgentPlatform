import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
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
});
