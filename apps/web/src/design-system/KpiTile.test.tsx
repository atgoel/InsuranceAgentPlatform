import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiRow } from './KpiRow';
import { KpiTile } from './KpiTile';

describe('AC-M00-34 KpiTile', () => {
  it('renders label, value and caption with neutral tone by default', () => {
    const { container } = render(<KpiTile label="Active users" value={42} caption="this month" />);
    expect(screen.getByText('Active users')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('this month')).toBeInTheDocument();
    expect(container.querySelector('.kpi-tile')).toHaveAttribute('data-tone', 'neutral');
  });

  it('exposes the tone', () => {
    const { container } = render(<KpiTile label="Overdue" value="3" tone="bad" />);
    expect(container.querySelector('.kpi-tile')).toHaveAttribute('data-tone', 'bad');
    expect(screen.queryByText('this month')).not.toBeInTheDocument();
  });
});

describe('AC-M00-34 KpiRow', () => {
  it('renders all tiles', () => {
    render(
      <KpiRow>
        <KpiTile label="A" value="1" />
        <KpiTile label="B" value="2" />
      </KpiRow>,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
