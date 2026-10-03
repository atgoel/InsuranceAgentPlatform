import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChecklistPanel } from './ChecklistPanel';
import { MemberDetail } from '../api';

describe('ChecklistPanel', () => {
  const mockMember: MemberDetail = {
    id: 'mem_1',
    displayName: 'John Seller',
    phoneMasked: '+91-****-****-1234',
    emailMasked: 'john****@example.com',
    roles: ['SALESPERSON'],
    salespersonType: 'ISP',
    orgUnitId: 'ou_branch1',
    orgUnitName: 'Branch 1',
    status: 'onboarding',
    capacityPerDay: 25,
    skills: [],
    languages: ['en'],
    invitedAt: '2024-01-01T00:00:00Z',
    mfaRequired: false,
    version: 1,
    etag: 'v1',
    checklist: [
      { key: 'IDENTITY_PAN', done: true },
      { key: 'TRAINING', done: false, hoursLogged: 10, hoursRequired: 25 },
      { key: 'EXAM', done: false },
      { key: 'CERTIFICATE', done: false },
      { key: 'INSURER_CODE', done: false },
    ],
    licences: [],
    insurerCodes: [],
  };

  it('AC-M02-15 renders member name and status', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByText('John Seller')).toBeInTheDocument();
    expect(screen.getByText('onboarding')).toBeInTheDocument();
  });

  it('AC-M02-15 displays masked contact information', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByText('+91-****-****-1234')).toBeInTheDocument();
    expect(screen.getByText('john****@example.com')).toBeInTheDocument();
  });

  it('AC-M02-15 displays checklist items with checkboxes', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByLabelText('IDENTITY_PAN')).toBeChecked();
    expect(screen.getByLabelText('TRAINING')).not.toBeChecked();
    expect(screen.getByLabelText('EXAM')).not.toBeChecked();
  });

  it('AC-M02-15 displays training hours progress', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByText('10/25 hours')).toBeInTheDocument();
  });

  it('AC-M02-15 displays Activate button disabled when checklist incomplete', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    const activateButton = screen.getByText('Activate');
    expect(activateButton).toBeDisabled();
  });

  it('AC-M02-04 displays Activate button enabled when checklist complete', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={true}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    const activateButton = screen.getByText('Activate');
    expect(activateButton).not.toBeDisabled();
  });

  it('AC-M02-04 calls onActivate when Activate button is clicked', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={true}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    const activateButton = screen.getByText('Activate');
    fireEvent.click(activateButton);
    expect(handleActivate).toHaveBeenCalled();
  });

  it('AC-M02-04 shows loading state during activation', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={true}
        activatingMemberId="mem_1"
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('AC-M02-04 displays activation error and missing items', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError="Missing required onboarding items"
        missingItems={['TRAINING', 'CERTIFICATE']}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByText('Missing required onboarding items')).toBeInTheDocument();
    const missingItems = screen.getAllByText(/TRAINING|CERTIFICATE/);
    expect(missingItems.length).toBeGreaterThan(0);
  });

  it('AC-M02-15 shows help text when checklist incomplete', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByText('Complete checklist first')).toBeInTheDocument();
  });

  it('AC-M02-15 disables Activate button when already activating', () => {
    const handleActivate = vi.fn();

    render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={true}
        activatingMemberId="mem_1"
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    const activateButton = screen.getByText('Loading...');
    expect(activateButton).toBeDisabled();
  });

  it('AC-M02-15 handles member without checklist', () => {
    const handleActivate = vi.fn();
    const memberWithoutChecklist: MemberDetail = {
      ...mockMember,
      checklist: undefined,
    };

    render(
      <ChecklistPanel
        member={memberWithoutChecklist}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.queryByText('Activate')).not.toBeInTheDocument();
  });

  it('AC-M02-15 handles member with empty checklist', () => {
    const handleActivate = vi.fn();
    const memberWithEmptyChecklist: MemberDetail = {
      ...mockMember,
      checklist: [],
    };

    render(
      <ChecklistPanel
        member={memberWithEmptyChecklist}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('AC-M02-15 displays note when available', () => {
    const handleActivate = vi.fn();
    const memberWithNote: MemberDetail = {
      ...mockMember,
      checklist: [
        { key: 'IDENTITY_PAN', done: true, note: 'Verified on 2024-01-01' },
        ...mockMember.checklist!.slice(1),
      ],
    };

    render(
      <ChecklistPanel
        member={memberWithNote}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    expect(screen.getByText('Verified on 2024-01-01')).toBeInTheDocument();
  });

  it('AC-M02-15 marks completed items visually', () => {
    const handleActivate = vi.fn();

    const { container } = render(
      <ChecklistPanel
        member={mockMember}
        isChecklistComplete={false}
        activatingMemberId={undefined}
        activationError={undefined}
        missingItems={[]}
        onActivate={handleActivate}
      />
    );

    const doneItems = container.querySelectorAll('.checklist-item.done');
    expect(doneItems.length).toBeGreaterThan(0);
  });
});
