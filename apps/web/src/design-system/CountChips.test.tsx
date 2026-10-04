import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CountChips } from './CountChips';

const options = [
  { id: 'all', label: 'All', count: 12 },
  { id: 'new', label: 'New', count: 3 },
  { id: 'won', label: 'Won' },
];

function renderChips(selected: string, onChange: (id: string) => void) {
  return render(<CountChips options={options} selected={selected} onChange={onChange} ariaLabel="Lead status" />);
}

describe('AC-M00-34 CountChips', () => {
  it('renders a labelled group with counts', () => {
    renderChips('all', () => {});
    expect(screen.getByRole('group', { name: 'Lead status' })).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('presses exactly the selected chip', () => {
    renderChips('new', () => {});
    const pressed = screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent('New');
  });

  it('calls onChange with the id on click, including the selected chip', async () => {
    const onChange = vi.fn();
    renderChips('all', onChange);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /New/ }));
    await user.click(screen.getByRole('button', { name: /All/ }));
    expect(onChange.mock.calls).toEqual([['new'], ['all']]);
  });

  it('activates with Enter and Space', async () => {
    const onChange = vi.fn();
    renderChips('all', onChange);
    const user = userEvent.setup();
    screen.getByRole('button', { name: /New/ }).focus();
    await user.keyboard('{Enter}');
    screen.getByRole('button', { name: 'Won' }).focus();
    await user.keyboard(' ');
    expect(onChange.mock.calls).toEqual([['new'], ['won']]);
  });
});
