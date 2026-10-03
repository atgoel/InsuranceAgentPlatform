import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsKPIs } from './StatsKPIs';

describe('StatsKPIs', () => {
  const mockStats = {
    invited: 5,
    onboarding: 8,
    active: 42,
    suspended: 2,
  };

  it('AC-M02-15 renders KPI tiles for all stages', () => {
    render(<StatsKPIs stats={mockStats} />);

    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
  });

  it('AC-M02-15 displays correct invited count', () => {
    render(<StatsKPIs stats={mockStats} />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('AC-M02-15 displays correct onboarding count', () => {
    render(<StatsKPIs stats={mockStats} />);

    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('AC-M02-15 displays correct active count', () => {
    render(<StatsKPIs stats={mockStats} />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('AC-M02-15 displays correct suspended count', () => {
    render(<StatsKPIs stats={mockStats} />);

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('AC-M02-15 renders tiles with correct structure', () => {
    const { container } = render(<StatsKPIs stats={mockStats} />);

    const kpiTiles = container.querySelectorAll('.kpi-tiles > *');
    expect(kpiTiles.length).toBe(4);
  });

  it('AC-M02-15 handles zero counts', () => {
    const zeroStats = {
      invited: 0,
      onboarding: 0,
      active: 0,
      suspended: 0,
    };

    render(<StatsKPIs stats={zeroStats} />);

    const zeroElements = screen.getAllByText('0');
    expect(zeroElements.length).toBe(4);
  });

  it('AC-M02-15 handles large counts', () => {
    const largeStats = {
      invited: 999,
      onboarding: 500,
      active: 10000,
      suspended: 100,
    };

    render(<StatsKPIs stats={largeStats} />);

    expect(screen.getByText('999')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('10000')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('AC-M02-15 displays KPI values and labels in correct order', () => {
    const { container } = render(<StatsKPIs stats={mockStats} />);

    const kpiContents = container.querySelectorAll('.kpi-content');
    expect(kpiContents.length).toBe(4);

    // First tile: Invited
    expect(kpiContents[0].textContent).toContain('5');
    expect(kpiContents[0].textContent).toContain('Invited');

    // Second tile: In Progress
    expect(kpiContents[1].textContent).toContain('8');
    expect(kpiContents[1].textContent).toContain('In Progress');

    // Third tile: Active
    expect(kpiContents[2].textContent).toContain('42');
    expect(kpiContents[2].textContent).toContain('Active');

    // Fourth tile: Suspended
    expect(kpiContents[3].textContent).toContain('2');
    expect(kpiContents[3].textContent).toContain('Suspended');
  });

  it('AC-M02-15 renders all KPI tiles using Card component', () => {
    const { container } = render(<StatsKPIs stats={mockStats} />);

    // Cards are rendered as elements with Card-like structure
    const tileContainer = container.querySelector('.kpi-tiles');
    expect(tileContainer).toBeInTheDocument();
    expect(tileContainer?.children.length).toBe(4);
  });

  it('AC-M02-15 updates when stats change', () => {
    const { rerender } = render(<StatsKPIs stats={mockStats} />);

    expect(screen.getByText('5')).toBeInTheDocument();

    const newStats = {
      invited: 10,
      onboarding: 15,
      active: 50,
      suspended: 3,
    };

    rerender(<StatsKPIs stats={newStats} />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('AC-M02-15 handles all zero stats', () => {
    const allZeroStats = {
      invited: 0,
      onboarding: 0,
      active: 0,
      suspended: 0,
    };

    render(<StatsKPIs stats={allZeroStats} />);

    const zeroElements = screen.getAllByText('0');
    expect(zeroElements).toHaveLength(4);
  });
});
