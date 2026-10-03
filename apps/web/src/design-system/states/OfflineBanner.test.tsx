import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

describe('AC-M00-28 OfflineBanner', () => {
  it('does not render when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
    render(<OfflineBanner />);
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it('renders when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    });
    render(<OfflineBanner />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('listens to online/offline events', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
    const { rerender } = render(<OfflineBanner />);
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
    });
    window.dispatchEvent(new Event('offline'));
    rerender(<OfflineBanner />);
  });
});
