import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChips } from './FilterChips';

describe('AC-M00-31 FilterChips component', () => {
  it('renders filter options', () => {
    render(
      <FilterChips
        options={[
          { id: 'opt1', label: 'Option 1' },
          { id: 'opt2', label: 'Option 2' },
        ]}
        selected={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });

  it('sets aria-pressed on selected chips', () => {
    render(
      <FilterChips
        options={[
          { id: 'opt1', label: 'Option 1' },
          { id: 'opt2', label: 'Option 2' },
        ]}
        selected={['opt1']}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Option 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Option 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onChange when chip is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterChips
        options={[{ id: 'opt1', label: 'Option 1' }]}
        selected={[]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Option 1' }));
    expect(onChange).toHaveBeenCalledWith(['opt1']);
  });

  it('renders count when provided', () => {
    render(
      <FilterChips
        options={[{ id: 'opt1', label: 'Option 1', count: 42 }]}
        selected={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('toggles selection in single select mode', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterChips
        options={[{ id: 'opt1', label: 'Option 1' }]}
        selected={['opt1']}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Option 1' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('adds selection in multi select mode', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterChips
        options={[
          { id: 'opt1', label: 'Option 1' },
          { id: 'opt2', label: 'Option 2' },
        ]}
        selected={['opt1']}
        onChange={onChange}
        multi={true}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Option 2' }));
    expect(onChange).toHaveBeenCalledWith(['opt1', 'opt2']);
  });

  it('removes selection in multi select mode', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterChips
        options={[
          { id: 'opt1', label: 'Option 1' },
          { id: 'opt2', label: 'Option 2' },
        ]}
        selected={['opt1', 'opt2']}
        onChange={onChange}
        multi={true}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Option 1' }));
    expect(onChange).toHaveBeenCalledWith(['opt2']);
  });

  it('supports multiple options with counts', () => {
    render(
      <FilterChips
        options={[
          { id: 'opt1', label: 'Option 1', count: 10 },
          { id: 'opt2', label: 'Option 2', count: 20 },
          { id: 'opt3', label: 'Option 3' },
        ]}
        selected={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.queryByText('Option 3')).toBeInTheDocument();
  });
});
