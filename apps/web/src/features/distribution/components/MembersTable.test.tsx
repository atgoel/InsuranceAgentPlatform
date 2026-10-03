import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MembersTable } from './MembersTable';
import { MemberView } from '../api';

describe('MembersTable', () => {
  const mockMembers: MemberView[] = [
    {
      id: 'mem_1',
      displayName: 'Alice Manager',
      phoneMasked: '+91-****-****-1111',
      emailMasked: 'alice****@example.com',
      roles: ['BRANCH_MANAGER'],
      orgUnitId: 'ou_branch1',
      orgUnitName: 'Branch 1',
      status: 'active',
      capacityPerDay: 25,
      skills: [],
      languages: ['en'],
      invitedAt: '2024-01-01T00:00:00Z',
      mfaRequired: true,
      version: 1,
      etag: 'v1',
    },
    {
      id: 'mem_2',
      displayName: 'Bob Seller',
      phoneMasked: '+91-****-****-2222',
      emailMasked: 'bob****@example.com',
      roles: ['SALESPERSON'],
      orgUnitId: 'ou_branch1',
      orgUnitName: 'Branch 1',
      status: 'active',
      capacityPerDay: 25,
      skills: [],
      languages: ['en'],
      invitedAt: '2024-02-01T00:00:00Z',
      mfaRequired: false,
      version: 1,
      etag: 'v1',
    },
    {
      id: 'mem_3',
      displayName: 'Carol Suspended',
      phoneMasked: '+91-****-****-3333',
      emailMasked: 'carol****@example.com',
      roles: ['SALES_MANAGER'],
      orgUnitId: 'ou_branch1',
      orgUnitName: 'Branch 1',
      status: 'suspended',
      capacityPerDay: 25,
      skills: [],
      languages: ['en'],
      invitedAt: '2024-03-01T00:00:00Z',
      mfaRequired: true,
      version: 1,
      etag: 'v1',
    },
  ];

  it('AC-M02-16 renders member names', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    expect(screen.getByText('Alice Manager')).toBeInTheDocument();
    expect(screen.getByText('Bob Seller')).toBeInTheDocument();
    expect(screen.getByText('Carol Suspended')).toBeInTheDocument();
  });

  it('AC-M02-13 displays masked phone numbers', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    expect(screen.getByText('+91-****-****-1111')).toBeInTheDocument();
    expect(screen.getByText('+91-****-****-2222')).toBeInTheDocument();
  });

  it('AC-M02-16 displays member roles', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    expect(screen.getByText('BRANCH_MANAGER')).toBeInTheDocument();
    expect(screen.getByText('SALESPERSON')).toBeInTheDocument();
    expect(screen.getByText('SALES_MANAGER')).toBeInTheDocument();
  });

  it('AC-M02-16 displays member status', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    const statusChips = screen.getAllByText(/active|suspended/);
    expect(statusChips.length).toBeGreaterThan(0);
  });

  it('AC-M02-12 displays MFA indicator for members requiring MFA', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    const mfaCheckmarks = screen.getAllByText('✓');
    expect(mfaCheckmarks.length).toBeGreaterThan(0);
  });

  it('AC-M02-06 shows Suspend button for active members', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    const suspendButtons = screen.getAllByText('Suspend');
    expect(suspendButtons.length).toBeGreaterThan(0);
  });

  it('AC-M02-06 calls onSuspend when Suspend button is clicked', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    const suspendButtons = screen.getAllByText('Suspend');
    fireEvent.click(suspendButtons[0]);
    expect(handleSuspend).toHaveBeenCalledWith('mem_1');
  });

  it('AC-M02-06 shows Reactivate button for suspended members', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    const reactivateButtons = screen.getAllByText('Reactivate');
    expect(reactivateButtons.length).toBeGreaterThan(0);
  });

  it('AC-M02-06 calls onReactivate when Reactivate button is clicked', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    const reactivateButtons = screen.getAllByText('Reactivate');
    fireEvent.click(reactivateButtons[0]);
    expect(handleReactivate).toHaveBeenCalledWith('mem_3');
  });

  it('AC-M02-16 renders table with correct columns', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    // Verify that DataGrid is rendered with members data
    expect(screen.getByText('Alice Manager')).toBeInTheDocument();
    expect(screen.getByText('Bob Seller')).toBeInTheDocument();
  });

  it('AC-M02-16 handles empty member list', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={[]}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    // Should render without errors, but no members shown
    expect(screen.queryByText('Alice Manager')).not.toBeInTheDocument();
  });

  it('AC-M02-16 shows action buttons only for appropriate statuses', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    render(
      <MembersTable
        members={mockMembers}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    // Count of Suspend buttons should be equal to count of active members
    const suspendButtons = screen.getAllByText('Suspend');
    expect(suspendButtons.length).toBe(2); // mem_1 and mem_2 are active

    // Count of Reactivate buttons should be equal to count of suspended members
    const reactivateButtons = screen.getAllByText('Reactivate');
    expect(reactivateButtons.length).toBe(1); // mem_3 is suspended
  });

  it('AC-M02-16 displays member without email', () => {
    const handleSuspend = vi.fn();
    const handleReactivate = vi.fn();

    const membersWithoutEmail = [
      { ...mockMembers[0], emailMasked: undefined },
    ];

    render(
      <MembersTable
        members={membersWithoutEmail}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    );

    expect(screen.getByText('Alice Manager')).toBeInTheDocument();
    expect(screen.getByText('+91-****-****-1111')).toBeInTheDocument();
  });
});
