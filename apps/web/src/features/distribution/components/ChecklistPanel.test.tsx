import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { memberDetail } from '../test-fixtures';
import type { MemberDetail } from '../api';
import { ChecklistPanel } from './ChecklistPanel';

const checklist: MemberDetail['checklist'] = [
  { key: 'IDENTITY_PAN', done: true, completedAt: '2026-10-04', note: 'PAN verified' },
  { key: 'TRAINING', done: false, hoursLogged: 10, hoursRequired: 25 },
  { key: 'EXAM', done: false },
];

function setup(over: Partial<Parameters<typeof ChecklistPanel>[0]> = {}) {
  const onActivate = vi.fn().mockResolvedValue(undefined);
  const props = {
    member: memberDetail({ displayName: 'John Seller', checklist }),
    isChecklistComplete: false,
    activatingMemberId: undefined,
    activationError: undefined,
    missingItems: [],
    onActivate,
    ...over,
  };
  render(<ChecklistPanel {...props} />);
  return onActivate;
}

describe('ChecklistPanel', () => {
  it('AC-M02-15 shows checklist steps by label with notes, hours and a formatted completion date (BUG-16)', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: 'Identity (PAN)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Training' })).not.toBeChecked();
    expect(screen.getByText('PAN verified')).toBeInTheDocument();
    expect(screen.getByText('10/25 hours')).toBeInTheDocument();
    expect(screen.getByText('Completed 4 Oct 2026')).toBeInTheDocument();
    expect(screen.queryByText('IDENTITY_PAN')).not.toBeInTheDocument();
  });

  it('AC-M02-15 disables Activate with the incomplete label until the checklist is complete', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Activate · checklist incomplete' })).toBeDisabled();
    expect(screen.getByText('Complete the checklist first')).toBeInTheDocument();
  });

  it('AC-M02-04 activates a candidate whose checklist is complete', () => {
    const onActivate = setup({ isChecklistComplete: true });
    fireEvent.click(screen.getByRole('button', { name: 'Activate John Seller' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('AC-M02-04 lists the missing items by label when activation is refused', () => {
    setup({ activationError: 'Missing required onboarding items', missingItems: ['TRAINING', 'EXAM'] });
    expect(screen.getByRole('alert')).toHaveTextContent('Missing required onboarding items');
    const items = Array.from(document.querySelectorAll('.missing-items li')).map((li) => li.textContent);
    expect(items).toEqual(['Training', 'Exam']);
  });

  it('AC-M02-04 shows a working state while activating', () => {
    setup({ isChecklistComplete: true, activatingMemberId: 'mem_1' });
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  });

  it('AC-M02-15 offers no Activate button once the member is active', () => {
    setup({ member: memberDetail({ status: 'active', checklist }), isChecklistComplete: true });
    expect(screen.queryByRole('button', { name: /Activate/ })).not.toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('AC-M02-15 shows an empty note for a member without checklist items', () => {
    setup({ member: memberDetail({ checklist: [] }) });
    expect(screen.getByText('No items')).toBeInTheDocument();
  });
});
