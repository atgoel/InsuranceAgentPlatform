import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoleCards } from './RoleCards';
import { RoleDefinition } from '../api';

describe('RoleCards', () => {
  const mockRoles: RoleDefinition[] = [
    {
      role: 'TENANT_ADMIN',
      version: 1,
      permissions: ['distribution.*', 'tenant.*'],
      recordScope: 'TENANT',
      privileged: true,
      editable: false,
      etag: 'v1',
    },
    {
      role: 'BRANCH_MANAGER',
      version: 1,
      permissions: [
        'distribution.member.read',
        'distribution.onboarding.write',
        'distribution.onboarding.approve',
      ],
      recordScope: 'UNIT_SUBTREE',
      privileged: true,
      editable: true,
      etag: 'v1',
    },
    {
      role: 'SALESPERSON',
      version: 1,
      permissions: ['distribution.self.read'],
      recordScope: 'OWN',
      privileged: false,
      editable: true,
      etag: 'v1',
    },
  ];

  it('AC-M02-16 renders roles section heading', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    expect(screen.getByText('Roles')).toBeInTheDocument();
  });

  it('AC-M02-16 displays role names', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    expect(screen.getByText('TENANT_ADMIN')).toBeInTheDocument();
    expect(screen.getByText('BRANCH_MANAGER')).toBeInTheDocument();
    expect(screen.getByText('SALESPERSON')).toBeInTheDocument();
  });

  it('AC-M02-16 displays MFA badge for privileged roles', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    const mfaBadges = screen.getAllByTitle('MFA Required');
    expect(mfaBadges.length).toBe(2); // TENANT_ADMIN and BRANCH_MANAGER
  });

  it('AC-M02-16 displays record scope for each role', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    const scopeElements = screen.getAllByText(/TENANT|UNIT_SUBTREE|OWN/);
    expect(scopeElements.length).toBeGreaterThan(0);
  });

  it('AC-M02-16 displays editability status for each role', () => {
    const handleEditRole = vi.fn();

    const { container } = render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    // Check for "Yes" and "No" in the rendered content
    expect(container.textContent).toContain('Yes');
    expect(container.textContent).toContain('No');
  });

  it('AC-M02-11 shows Edit button only for editable roles', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    const editButtons = screen.getAllByText('Edit');
    expect(editButtons.length).toBe(2); // BRANCH_MANAGER and SALESPERSON are editable
  });

  it('AC-M02-11 does not show Edit button for non-editable roles', () => {
    const handleEditRole = vi.fn();

    const { container } = render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    // We can verify by checking that not all cards have buttons
    const allButtons = container.querySelectorAll('.role-card button');
    expect(allButtons.length).toBe(2); // Only 2 edit buttons for editable roles
  });

  it('AC-M02-16 calls onEditRole when Edit button is clicked', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    expect(handleEditRole).toHaveBeenCalledWith(mockRoles[1]); // BRANCH_MANAGER
  });

  it('AC-M02-16 renders all roles without errors', () => {
    const handleEditRole = vi.fn();

    const { container } = render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    const roleCards = container.querySelectorAll('.role-card');
    expect(roleCards.length).toBe(3);
  });

  it('AC-M02-16 handles empty role list', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={[]}
        onEditRole={handleEditRole}
      />
    );

    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.queryByText('TENANT_ADMIN')).not.toBeInTheDocument();
  });

  it('AC-M02-12 distinguishes between privileged and non-privileged roles visually', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    // Privileged roles should have MFA badge
    const mfaBadges = screen.getAllByTitle('MFA Required');
    expect(mfaBadges.length).toBe(2);

    // Non-privileged role (SALESPERSON) should not show MFA badge
    const salespersonCard = screen.getByText('SALESPERSON');
    const salespersonMFABadge = salespersonCard.closest('.role-card')?.querySelector('[title="MFA Required"]');
    expect(salespersonMFABadge).not.toBeInTheDocument();
  });

  it('AC-M02-16 allows editing multiple different roles', () => {
    const handleEditRole = vi.fn();

    render(
      <RoleCards
        roles={mockRoles}
        onEditRole={handleEditRole}
      />
    );

    const editButtons = screen.getAllByText('Edit');

    fireEvent.click(editButtons[0]);
    expect(handleEditRole).toHaveBeenNthCalledWith(1, mockRoles[1]); // BRANCH_MANAGER

    fireEvent.click(editButtons[1]);
    expect(handleEditRole).toHaveBeenNthCalledWith(2, mockRoles[2]); // SALESPERSON
  });
});
