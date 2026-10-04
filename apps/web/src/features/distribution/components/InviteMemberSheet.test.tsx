import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { ApiError } from '../../../lib/api/api-error';
import { role } from '../test-fixtures';
import { InviteMemberSheet } from './InviteMemberSheet';

const roles = [role({ role: 'SALESPERSON' }), role({ role: 'BRANCH_MANAGER' })];
const units = [
  { id: 'ou_root', name: 'Head Office' },
  { id: 'ou_branch1', name: 'Andheri' },
];

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(<InviteMemberSheet isOpen roles={roles} units={units} onClose={onClose} onSubmit={onSubmit} />);
  return { onSubmit, onClose };
}

function fillValid() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'John Seller' } });
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+91-1234-5678-9012' } });
  fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'ou_branch1' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Salesperson' }));
}

describe('InviteMemberSheet', () => {
  it('AC-M02-05 renders nothing when closed', () => {
    render(<InviteMemberSheet isOpen={false} roles={roles} units={units} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-M02-05 lists roles by label and units by name, never raw codes (BUG-09)', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: 'Salesperson' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Branch manager' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Andheri' })).toBeInTheDocument();
    expect(screen.queryByText('SALESPERSON')).not.toBeInTheDocument();
  });

  it('AC-M02-05 requires name, contact, role and unit', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(screen.getByText('Name required')).toBeInTheDocument();
    expect(screen.getByText('Phone or email required')).toBeInTheDocument();
    expect(screen.getByText('Roles required')).toBeInTheDocument();
    expect(screen.getByText('Unit required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('AC-M02-05 submits exactly the entered values, with the chosen unit', async () => {
    const { onSubmit } = setup();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      displayName: 'John Seller',
      phone: '+91-1234-5678-9012',
      email: undefined,
      roles: ['SALESPERSON'],
      orgUnitId: 'ou_branch1',
    });
  });

  it('AC-M02-02 accepts an email as the only contact', async () => {
    const { onSubmit } = setup();
    fillValid();
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'john@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      displayName: 'John Seller',
      phone: undefined,
      email: 'john@example.com',
      roles: ['SALESPERSON'],
      orgUnitId: 'ou_branch1',
    });
  });

  it('AC-M02-05 shows the server title inline and keeps the entered values', async () => {
    const { onSubmit } = setup(vi.fn().mockRejectedValue(new ApiError(409, 'member_exists', 'A member with this phone already exists')));
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A member with this phone already exists');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Name')).toHaveValue('John Seller');
  });

  it('AC-M02-05 closes on Cancel', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
