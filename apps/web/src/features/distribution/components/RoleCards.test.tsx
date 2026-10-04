import { describe, it, expect, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { renderT as render } from '../test-render';
import { role } from '../test-fixtures';
import { RoleCards } from './RoleCards';

describe('RoleCards', () => {
  const roles = [
    role(),
    role({ role: 'TENANT_ADMIN', recordScope: 'TENANT', editable: false }),
    role({ role: 'SALESPERSON', recordScope: 'OWN', privileged: false }),
  ];

  it('AC-M02-16 shows each role by its label with its scope label, never raw codes (BUG-09, UI-07)', () => {
    render(<RoleCards roles={roles} onEditRole={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Roles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Branch manager' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tenant admin' })).toBeInTheDocument();
    expect(screen.getByText('Unit and sub-units')).toBeInTheDocument();
    expect(screen.getByText('All tenant records')).toBeInTheDocument();
    expect(screen.getByText('Own records')).toBeInTheDocument();
    expect(screen.queryByText('TENANT_ADMIN')).not.toBeInTheDocument();
    expect(screen.queryByText('OWN')).not.toBeInTheDocument();
  });

  it('AC-M02-12 shows the MFA badge only on privileged roles', () => {
    render(<RoleCards roles={roles} onEditRole={vi.fn()} />);
    expect(screen.getAllByText('MFA')).toHaveLength(2);
  });

  it('AC-M02-11 offers Edit only for editable roles and passes the role on click', () => {
    const onEditRole = vi.fn();
    render(<RoleCards roles={roles} onEditRole={onEditRole} />);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    const card = screen.getByRole('heading', { name: 'Salesperson' }).closest('.role-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    expect(onEditRole).toHaveBeenCalledExactlyOnceWith(roles[2]);
  });

  it('AC-M02-11 is read-only without distribution.role.write', () => {
    render(<RoleCards roles={roles} canEdit={false} onEditRole={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('AC-M02-16 marks the role being edited as pressed', () => {
    render(<RoleCards roles={roles} selectedRole="SALESPERSON" onEditRole={vi.fn()} />);
    const pressed = screen.getAllByRole('button', { name: 'Edit' }).filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
  });
});
