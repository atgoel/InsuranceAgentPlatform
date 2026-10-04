import { describe, it, expect, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { member } from '../test-fixtures';
import { OnboardingPipeline } from './OnboardingPipeline';

const members = [
  member({ id: 'a', displayName: 'Invited One', status: 'invited', salespersonType: 'POSP' }),
  member({ id: 'b', displayName: 'Onboarding One', status: 'onboarding', salespersonType: 'ISP' }),
  member({ id: 'c', displayName: 'Suspended One', status: 'suspended' }),
];

describe('OnboardingPipeline', () => {
  it('AC-M02-15 groups candidates by status column with counts and type labels', () => {
    render(<OnboardingPipeline members={members} onSelect={vi.fn()} />);
    const invited = screen.getByRole('region', { name: 'Invited' });
    expect(within(invited).getByText('Invited One')).toBeInTheDocument();
    expect(within(invited).getByText(/POSP · Andheri/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'In onboarding' })).getByText('Onboarding One')).toBeInTheDocument();
    expect(screen.queryByText('Suspended One')).not.toBeInTheDocument();
  });

  it('AC-M02-15 selects a candidate and marks it pressed', () => {
    const onSelect = vi.fn();
    render(<OnboardingPipeline members={members} selectedId="b" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Onboarding One/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Invited One/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('AC-M02-15 shows an empty state when no candidate is in the unit', () => {
    render(<OnboardingPipeline members={[members[2]]} onSelect={vi.fn()} />);
    expect(screen.getByText('No candidates in this unit')).toBeInTheDocument();
  });
});
