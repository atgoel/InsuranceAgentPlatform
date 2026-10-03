import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from './Timeline';

describe('AC-M00-31 Timeline', () => {
  it('renders items', () => {
    const items = [
      { id: '1', at: '10:00 AM', title: 'Item 1', tone: 'ok' as const },
      { id: '2', at: '11:00 AM', title: 'Item 2', detail: 'Details' },
    ];
    render(<Timeline items={items} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
