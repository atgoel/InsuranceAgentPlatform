import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSkeleton } from './LoadingSkeleton';

describe('AC-M00-28 LoadingSkeleton', () => {
  it('has correct role and label', () => {
    render(<LoadingSkeleton />);
    const element = screen.getByRole('progressbar');
    expect(element).toHaveAttribute('aria-label', 'Loading');
    expect(element).toHaveAttribute('aria-busy', 'true');
  });

  it('renders lines', () => {
    const { container } = render(<LoadingSkeleton lines={5} />);
    const lines = container.querySelectorAll('.skeleton-line');
    expect(lines).toHaveLength(5);
  });
});
