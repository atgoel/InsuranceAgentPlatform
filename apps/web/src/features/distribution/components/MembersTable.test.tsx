import { describe, it, expect, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { member, role } from '../test-fixtures';
import { MembersTable } from './MembersTable';

const noop = () => undefined;

describe('MembersTable', () => {
  it('AC-M02-16 shows role chips and record scope as labels, never raw codes (BUG-09)', () => {
    render(<MembersTable members={[member()]} roles={[role()]} onSuspend={noop} onReactivate={noop} />);
    const row = screen.getByRole('row', { name: /Alice Manager/ });
    expect(within(row).getByText('Branch manager')).toBeInTheDocument();
    expect(within(row).getByText('Unit and sub-units')).toBeInTheDocument();
    expect(screen.queryByText('BRANCH_MANAGER')).not.toBeInTheDocument();
    expect(screen.queryByText('UNIT_SUBTREE')).not.toBeInTheDocument();
  });

  it('AC-M02-13 shows only the masked contact', () => {
    render(<MembersTable members={[member({ phoneMasked: '+91-****-****-1111', emailMasked: undefined })]} onSuspend={noop} onReactivate={noop} />);
    expect(screen.getByText('+91-****-****-1111')).toBeInTheDocument();
  });

  it('AC-M02-12 shows MFA for members that require it and Mobile OTP for the others', () => {
    const members = [member({ id: 'a', displayName: 'Mfa Person', mfaRequired: true }), member({ id: 'b', displayName: 'Otp Person', mfaRequired: false })];
    render(<MembersTable members={members} onSuspend={noop} onReactivate={noop} />);
    expect(within(screen.getByRole('row', { name: /Mfa Person/ })).getByText('MFA')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Otp Person/ })).getByText('Mobile OTP')).toBeInTheDocument();
  });

  it('AC-M02-06 offers Deactivate for active, Reactivate for deactivated and nothing for invited members', () => {
    const onSuspend = vi.fn();
    const onReactivate = vi.fn();
    const members = [
      member({ id: 'a', displayName: 'Active One', status: 'active' }),
      member({ id: 'b', displayName: 'Gone One', status: 'suspended' }),
      member({ id: 'c', displayName: 'New One', status: 'invited' }),
    ];
    render(<MembersTable members={members} onSuspend={onSuspend} onReactivate={onReactivate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Active One' }));
    expect(onSuspend).toHaveBeenCalledExactlyOnceWith('a');
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate Gone One' }));
    expect(onReactivate).toHaveBeenCalledExactlyOnceWith('b');
    expect(within(screen.getByRole('row', { name: /New One/ })).queryByRole('button')).not.toBeInTheDocument();
  });

  it('AC-M02-16 leaves out the action column when the caller cannot manage members and the scope column when roles are unknown', () => {
    render(<MembersTable members={[member()]} canManage={false} onSuspend={noop} onReactivate={noop} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Record scope' })).not.toBeInTheDocument();
  });

  it('AC-M02-16 shows status labels', () => {
    render(<MembersTable members={[member({ status: 'suspended' })]} onSuspend={noop} onReactivate={noop} />);
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
    expect(screen.queryByText('suspended')).not.toBeInTheDocument();
  });

  it('AC-M02-16 shows an empty state when no member matches', () => {
    render(<MembersTable members={[]} onSuspend={noop} onReactivate={noop} />);
    expect(screen.getByText('No users match these filters')).toBeInTheDocument();
  });
});
