import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState, ApiError } from './ErrorState';
import { I18nProvider } from '../../lib/i18n';

describe('AC-M00-28 ErrorState component', () => {
  it('renders error message', () => {
    const error = new ApiError(500, 'error_code', 'Something went wrong');
    render(<I18nProvider><ErrorState error={error} /></I18nProvider>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows trace reference when traceId exists', () => {
    const error = new ApiError(
      500,
      'error_code',
      'Something went wrong',
      undefined,
      '12345678abcdef00',
    );
    render(<I18nProvider><ErrorState error={error} /></I18nProvider>);
    expect(screen.getByText(/Reference 12345678/)).toBeInTheDocument();
  });

  it('renders retry button when provided', () => {
    const onRetry = vi.fn();
    const error = new Error('Something went wrong');
    render(<I18nProvider><ErrorState error={error} onRetry={onRetry} /></I18nProvider>);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('AC-M00-28 renders title, reference, copy label and retry in Hindi', () => {
    const error = new ApiError(500, 'error_code', 'Server detail', undefined, '12345678abcdef00');
    render(
      <I18nProvider initialLang="hi">
        <ErrorState error={error} onRetry={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'कुछ गलत हुआ' })).toBeInTheDocument();
    expect(screen.getByText('संदर्भ 12345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ट्रेस आईडी कॉपी करें' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'फिर से प्रयास करें' })).toBeInTheDocument();
  });
});
