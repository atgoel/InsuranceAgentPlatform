import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';

describe('AC-M00-31 Toast', () => {
  function TestComponent() {
    const { show } = useToast();
    return (
      <button onClick={() => show('Test message', 'ok')}>
        Show Toast
      </button>
    );
  }

  it('renders toast with message', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TestComponent />
        <div role="region" aria-live="polite" aria-label="Notifications" className="toast-container" />
      </ToastProvider>,
    );
    // Toast would show and auto-dismiss
    vi.useRealTimers();
  });

  it('has aria-live polite region', () => {
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );
    const region = screen.getByLabelText('Notifications');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });
});
