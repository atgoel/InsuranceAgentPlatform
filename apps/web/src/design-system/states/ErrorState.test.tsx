import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState, ApiError } from './ErrorState';

describe('AC-M00-28 ErrorState component', () => {
  it('renders error message', () => {
    const error = new ApiError(500, 'error_code', 'Something went wrong');
    render(<ErrorState error={error} />);
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
    render(<ErrorState error={error} />);
    expect(screen.getByText(/Reference 12345678/)).toBeInTheDocument();
  });

  it('renders retry button when provided', () => {
    const onRetry = vi.fn();
    const error = new Error('Something went wrong');
    render(<ErrorState error={error} onRetry={onRetry} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
