import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSkeleton } from './LoadingSkeleton';
import { I18nProvider } from '../../lib/i18n';

describe('AC-M00-28 LoadingSkeleton', () => {
  it('has correct role and label', () => {
    render(<I18nProvider><LoadingSkeleton /></I18nProvider>);
    const element = screen.getByRole('progressbar');
    expect(element).toHaveAttribute('aria-label', 'Loading');
    expect(element).toHaveAttribute('aria-busy', 'true');
  });

  it('renders lines', () => {
    const { container } = render(<I18nProvider><LoadingSkeleton lines={5} /></I18nProvider>);
    const lines = container.querySelectorAll('.skeleton-line');
    expect(lines).toHaveLength(5);
  });

  it('AC-M00-28 labels the skeleton in Hindi', () => {
    render(
      <I18nProvider initialLang="hi">
        <LoadingSkeleton />
      </I18nProvider>,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'लोड हो रहा है');
  });
});
