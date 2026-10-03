import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState';

describe('AC-M00-28 EmptyState component', () => {
  it('renders title', () => {
    render(<EmptyState title="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders body when provided', () => {
    render(<EmptyState title="No data" body="Try again later" />);
    expect(screen.getByText('Try again later')).toBeInTheDocument();
  });

  it('renders action button when provided', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState title="No data" action={{ label: 'Retry', onClick }} />,
    );
    const btn = screen.getByRole('button', { name: /retry/i });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});
