import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { StatsKPIs } from './StatsKPIs';

describe('StatsKPIs', () => {
  it('AC-M02-15 shows the in-onboarding count and the licences expiring in 60 days', () => {
    render(<StatsKPIs inOnboarding={4} licencesExpiring={3} />);
    expect(screen.getByText('In onboarding').nextElementSibling).toHaveTextContent('4');
    expect(screen.getByText('Licences expiring in 60 days').nextElementSibling).toHaveTextContent('3');
  });

  it('AC-M02-15 shows a dash while the licence count is unknown', () => {
    render(<StatsKPIs inOnboarding={0} />);
    expect(screen.getByText('Licences expiring in 60 days').nextElementSibling).toHaveTextContent('—');
  });
});
