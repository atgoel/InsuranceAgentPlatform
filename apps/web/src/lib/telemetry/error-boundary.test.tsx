import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './error-boundary';
import { ClientTelemetry } from './client-telemetry';

describe('AC-M00-30 ErrorBoundary', () => {
  function ThrowError() {
    throw new Error('Test error');
  }

  it('renders ErrorState on crash', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('reports error to telemetry', () => {
    const send = vi.fn();
    const telemetry = new ClientTelemetry({ send });
    const reportError = vi.spyOn(telemetry, 'reportError');

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary telemetry={telemetry}>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(reportError).toHaveBeenCalled();
    spy.mockRestore();
  });
});
