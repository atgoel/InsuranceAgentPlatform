import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';
import { I18nProvider } from '../../lib/i18n';

describe('AC-M00-28 OfflineBanner', () => {
  it('does not render when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
    render(<I18nProvider><OfflineBanner /></I18nProvider>);
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it('renders when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    });
    render(<I18nProvider><OfflineBanner /></I18nProvider>);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('listens to online/offline events', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
    const { rerender } = render(<I18nProvider><OfflineBanner /></I18nProvider>);
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    });
    window.dispatchEvent(new Event('offline'));
    rerender(<I18nProvider><OfflineBanner /></I18nProvider>);
  });

  it('AC-M00-28 renders the Hindi offline message', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    });
    render(
      <I18nProvider initialLang="hi">
        <OfflineBanner />
      </I18nProvider>,
    );
    expect(screen.getByText(/आप ऑफ़लाइन हैं। दोबारा जुड़ने पर बदलाव सिंक हो जाएँगे।/)).toBeInTheDocument();
  });
});
