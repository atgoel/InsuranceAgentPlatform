import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RolePreviewPanel } from './RolePreviewPanel';
import { RolePreview } from '../api';

describe('RolePreviewPanel', () => {
  const mockPreview: RolePreview = {
    role: 'BRANCH_MANAGER',
    sees: [
      'distribution.member.read',
      'distribution.onboarding.write',
      'distribution.onboarding.approve',
      'distribution.transfer.write',
    ],
  };

  it('AC-M02-16 renders preview heading', () => {
    render(<RolePreviewPanel preview={mockPreview} />);

    expect(screen.getByText('What this role sees')).toBeInTheDocument();
  });

  it('AC-M02-16 displays all permissions from preview', () => {
    render(<RolePreviewPanel preview={mockPreview} />);

    expect(screen.getByText('distribution.member.read')).toBeInTheDocument();
    expect(screen.getByText('distribution.onboarding.write')).toBeInTheDocument();
    expect(screen.getByText('distribution.onboarding.approve')).toBeInTheDocument();
    expect(screen.getByText('distribution.transfer.write')).toBeInTheDocument();
  });

  it('AC-M02-16 renders permission tags', () => {
    const { container } = render(<RolePreviewPanel preview={mockPreview} />);

    const permissionTags = container.querySelectorAll('.permission-tag');
    expect(permissionTags.length).toBe(4);
  });

  it('AC-M02-16 returns null when preview is undefined', () => {
    const { container } = render(<RolePreviewPanel preview={undefined} />);

    expect(container.firstChild).toBeNull();
  });

  it('AC-M02-16 handles empty permissions list', () => {
    const emptyPreview: RolePreview = {
      role: 'EMPTY_ROLE',
      sees: [],
    };

    render(<RolePreviewPanel preview={emptyPreview} />);

    expect(screen.getByText('What this role sees')).toBeInTheDocument();
  });

  it('AC-M02-16 displays single permission', () => {
    const singlePermissionPreview: RolePreview = {
      role: 'VIEWER',
      sees: ['distribution.member.read'],
    };

    render(<RolePreviewPanel preview={singlePermissionPreview} />);

    expect(screen.getByText('distribution.member.read')).toBeInTheDocument();
  });

  it('AC-M02-16 displays permissions in order', () => {
    const { container } = render(<RolePreviewPanel preview={mockPreview} />);

    const permissionTags = container.querySelectorAll('.permission-tag');
    expect(permissionTags[0].textContent).toBe('distribution.member.read');
    expect(permissionTags[1].textContent).toBe('distribution.onboarding.write');
    expect(permissionTags[2].textContent).toBe('distribution.onboarding.approve');
    expect(permissionTags[3].textContent).toBe('distribution.transfer.write');
  });

  it('AC-M02-11 displays preview after role selection', () => {
    const { rerender } = render(<RolePreviewPanel preview={undefined} />);

    expect(screen.queryByText('What this role sees')).not.toBeInTheDocument();

    rerender(<RolePreviewPanel preview={mockPreview} />);

    expect(screen.getByText('What this role sees')).toBeInTheDocument();
    expect(screen.getByText('distribution.member.read')).toBeInTheDocument();
  });

  it('AC-M02-16 handles preview with wildcard permissions', () => {
    const wildcardPreview: RolePreview = {
      role: 'ADMIN',
      sees: [
        'distribution.*',
        'tenant.*',
        'ops.*',
      ],
    };

    render(<RolePreviewPanel preview={wildcardPreview} />);

    expect(screen.getByText('distribution.*')).toBeInTheDocument();
    expect(screen.getByText('tenant.*')).toBeInTheDocument();
    expect(screen.getByText('ops.*')).toBeInTheDocument();
  });

  it('AC-M02-16 hides preview when cleared', () => {
    const { rerender } = render(<RolePreviewPanel preview={mockPreview} />);

    expect(screen.getByText('What this role sees')).toBeInTheDocument();

    rerender(<RolePreviewPanel preview={undefined} />);

    expect(screen.queryByText('What this role sees')).not.toBeInTheDocument();
  });
});
