import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from './Tabs';

describe('AC-M00-31 Tabs component', () => {
  it('renders tabs with labels', () => {
    render(
      <Tabs
        tabs={[
          { id: 'tab1', label: 'Tab 1' },
          { id: 'tab2', label: 'Tab 2' },
        ]}
        value="tab1"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
  });

  it('sets aria-selected on active tab', () => {
    render(
      <Tabs
        tabs={[
          { id: 'tab1', label: 'Tab 1' },
          { id: 'tab2', label: 'Tab 2' },
        ]}
        value="tab1"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange when tab is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Tabs
        tabs={[
          { id: 'tab1', label: 'Tab 1' },
          { id: 'tab2', label: 'Tab 2' },
        ]}
        value="tab1"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('renders badges when provided', () => {
    render(
      <Tabs
        tabs={[
          { id: 'tab1', label: 'Tab 1', badge: 5 },
          { id: 'tab2', label: 'Tab 2' },
        ]}
        value="tab1"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
