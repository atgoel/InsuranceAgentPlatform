import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ApiClient } from '../../../lib/api/api-client';
import { ApiError } from '../../../lib/api/api-error';
import { useRoles } from './useRoles';
import { RoleDefinition, ListRolesResponse, RolePreview } from '../api';

describe('useRoles hook', () => {
  let mockApiClient: ApiClient;

  const mockRole: RoleDefinition = {
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
  };

  const mockRolePreview: RolePreview = {
    role: 'BRANCH_MANAGER',
    sees: [
      'distribution.member.read',
      'distribution.onboarding.write',
      'distribution.onboarding.approve',
    ],
  };

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    };
  });

  it('AC-M02-16 initializes with empty roles and loading state', () => {
    (mockApiClient.get as Mock).mockResolvedValue({ items: [] } as ListRolesResponse);

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    expect(result.current.roles).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.rolePreview).toBeUndefined();
  });

  it('AC-M02-16 loads roles successfully and updates state', async () => {
    const mockResponse: ListRolesResponse = {
      items: [mockRole],
    };
    (mockApiClient.get as Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadRoles();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.roles).toEqual([mockRole]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('AC-M02-16 handles API errors when loading roles', async () => {
    const apiError = new ApiError(500, 'server_error', 'Server error');
    (mockApiClient.get as Mock).mockRejectedValue(apiError);

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadRoles();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.code).toBe('server_error');
    expect(result.current.loading).toBe(false);
  });

  it('AC-M02-16 loads role preview successfully', async () => {
    (mockApiClient.get as Mock).mockResolvedValue(mockRolePreview);

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadRolePreview('BRANCH_MANAGER');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.rolePreview).toEqual(mockRolePreview);
  });

  it('AC-M02-16 clears role preview on error', async () => {
    const apiError = new ApiError(404, 'not_found', 'Role not found');
    (mockApiClient.get as Mock).mockRejectedValue(apiError);

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadRolePreview('UNKNOWN_ROLE');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.rolePreview).toBeUndefined();
  });

  it('AC-M02-11 updates role permissions and increments version', async () => {
    const updatedRole: RoleDefinition = {
      ...mockRole,
      version: 2,
      permissions: [...mockRole.permissions, 'distribution.member.write'],
      etag: 'v2',
    };

    (mockApiClient.get as Mock).mockResolvedValue({ items: [mockRole] } as ListRolesResponse);
    (mockApiClient.put as Mock).mockResolvedValue(updatedRole);

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadRoles();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    act(() => {
      result.current.updateRolePermissions('BRANCH_MANAGER', updatedRole.permissions, mockRole.etag);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const updated = result.current.roles.find((r) => r.role === 'BRANCH_MANAGER');
    expect(updated?.version).toBe(2);
    expect(updated?.etag).toBe('v2');
  });

  it('AC-M02-11 handles 412 conflict error (If-Match) for stale role version', async () => {
    const conflictError = new ApiError(412, 'conflict', 'Version conflict');
    (mockApiClient.get as Mock).mockResolvedValue({ items: [mockRole] } as ListRolesResponse);
    (mockApiClient.put as Mock).mockRejectedValue(conflictError);

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadRoles();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      act(() => {
        result.current.updateRolePermissions('BRANCH_MANAGER', [...mockRole.permissions, 'distribution.member.write'], 'v_old').catch(() => {});
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      // Expected to throw
    }

    // Verify the put was called with the stale etag
    expect((mockApiClient.put as Mock).mock.calls[0][2]).toEqual({
      ifMatch: 'v_old',
    });
  });

  it('AC-M02-16 handles unknown error types during role load', async () => {
    (mockApiClient.get as Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadRoles();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.code).toBe('unknown');
    expect(result.current.loading).toBe(false);
  });

  it('AC-M02-16 updates roles list after successful permission update', async () => {
    const role1 = mockRole;
    const role2: RoleDefinition = { ...mockRole, role: 'SALES_MANAGER' };
    const updatedRole1 = { ...role1, version: 2, permissions: [...role1.permissions, 'distribution.member.write'], etag: 'v2' };

    (mockApiClient.get as Mock).mockResolvedValue({ items: [role1, role2] } as ListRolesResponse);
    (mockApiClient.put as Mock).mockResolvedValue(updatedRole1);

    const { result } = renderHook(() => useRoles({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadRoles();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.roles).toHaveLength(2);

    act(() => {
      result.current.updateRolePermissions('BRANCH_MANAGER', updatedRole1.permissions, role1.etag);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const branchManagerRole = result.current.roles.find((r) => r.role === 'BRANCH_MANAGER');
    const salesManagerRole = result.current.roles.find((r) => r.role === 'SALES_MANAGER');

    expect(branchManagerRole?.version).toBe(2);
    expect(salesManagerRole?.version).toBe(1); // Should not change
  });
});
