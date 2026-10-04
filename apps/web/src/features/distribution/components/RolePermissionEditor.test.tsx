import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { role } from '../test-fixtures';
import { RolePermissionEditor } from './RolePermissionEditor';

describe('RolePermissionEditor', () => {
  it('AC-M02-11 shows permission labels and marks the current ones checked', () => {
    render(<RolePermissionEditor role={role({ permissions: ['distribution.member.read'] })} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'View members' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Edit role permissions' })).not.toBeChecked();
  });

  it('AC-M02-11 shows a locked permission the role holds as disabled with the Locked badge', () => {
    render(<RolePermissionEditor role={role({ permissions: ['party.medical.read'] })} onSave={vi.fn()} onCancel={vi.fn()} />);
    const locked = screen.getByRole('checkbox', { name: /party\.medical\.read/ });
    expect(locked).toBeDisabled();
    expect(locked).toBeChecked();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('AC-M02-11 keeps permissions of other modules visible and saves them unchanged', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RolePermissionEditor role={role({ permissions: ['crm.lead.read'] })} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'crm.lead.read' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'View members' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as role version 3' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(['crm.lead.read', 'distribution.member.read'], 'v2');
  });

  it('AC-M02-11 does not toggle a locked permission', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RolePermissionEditor role={role({ permissions: ['audit.delete'] })} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /audit\.delete/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as role version 3' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(['audit.delete'], 'v2');
  });

  it('AC-M02-11 shows the server error inline and a saving state', () => {
    const { rerender } = render(<RolePermissionEditor role={role()} onSave={vi.fn()} onCancel={vi.fn()} error="Role was changed by someone else" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Role was changed by someone else');
    rerender(<RolePermissionEditor role={role()} onSave={vi.fn()} onCancel={vi.fn()} isSaving />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('AC-M02-11 cancels without saving', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<RolePermissionEditor role={role()} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
