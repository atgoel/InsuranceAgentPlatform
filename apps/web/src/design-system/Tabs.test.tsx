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

  it('navigates to next tab with arrow right', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const tab1 = { id: 'tab1', label: 'Tab 1' };
    const tab2 = { id: 'tab2', label: 'Tab 2' };
    const tab3 = { id: 'tab3', label: 'Tab 3' };

    render(
      <Tabs
        tabs={[tab1, tab2, tab3]}
        value="tab1"
        onChange={onChange}
      />,
    );

    const activeTab = screen.getByRole('tab', { name: 'Tab 1' });
    await user.click(activeTab);
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('navigates to previous tab with arrow left', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const tab1 = { id: 'tab1', label: 'Tab 1' };
    const tab2 = { id: 'tab2', label: 'Tab 2' };
    const tab3 = { id: 'tab3', label: 'Tab 3' };

    render(
      <Tabs
        tabs={[tab1, tab2, tab3]}
        value="tab2"
        onChange={onChange}
      />,
    );

    const activeTab = screen.getByRole('tab', { name: 'Tab 2' });
    await user.click(activeTab);
    await user.keyboard('{ArrowLeft}');

    expect(onChange).toHaveBeenCalledWith('tab1');
  });

  it('wraps to last tab when pressing arrow left on first tab', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const tab1 = { id: 'tab1', label: 'Tab 1' };
    const tab2 = { id: 'tab2', label: 'Tab 2' };
    const tab3 = { id: 'tab3', label: 'Tab 3' };

    render(
      <Tabs
        tabs={[tab1, tab2, tab3]}
        value="tab1"
        onChange={onChange}
      />,
    );

    const activeTab = screen.getByRole('tab', { name: 'Tab 1' });
    await user.click(activeTab);
    await user.keyboard('{ArrowLeft}');

    expect(onChange).toHaveBeenCalledWith('tab3');
  });

  it('wraps to first tab when pressing arrow right on last tab', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const tab1 = { id: 'tab1', label: 'Tab 1' };
    const tab2 = { id: 'tab2', label: 'Tab 2' };
    const tab3 = { id: 'tab3', label: 'Tab 3' };

    render(
      <Tabs
        tabs={[tab1, tab2, tab3]}
        value="tab3"
        onChange={onChange}
      />,
    );

    const activeTab = screen.getByRole('tab', { name: 'Tab 3' });
    await user.click(activeTab);
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('tab1');
  });

  it('supports segmented variant', () => {
    render(
      <Tabs
        tabs={[
          { id: 'tab1', label: 'Tab 1' },
          { id: 'tab2', label: 'Tab 2' },
        ]}
        value="tab1"
        onChange={() => {}}
        variant="segmented"
      />,
    );

    const tabList = screen.getByRole('tablist');
    expect(tabList).toHaveClass('tabs-segmented');
  });

  it('has aria-controls attribute on tabs', () => {
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

    expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-controls', 'panel-tab1');
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-controls', 'panel-tab2');
  });
});
