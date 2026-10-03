import { useState, useCallback } from 'react';
import { ApiError } from '../../../lib/api/api-error';
import { createDistributionApi, RoleDefinition, RolePreview } from '../api';
import { ApiClient } from '../../../lib/api/api-client';

interface UseRolesOptions {
  apiClient: ApiClient;
}

interface UseRolesState {
  roles: RoleDefinition[];
  rolePreview: RolePreview | undefined;
  loading: boolean;
  error: ApiError | undefined;
}

export function useRoles({ apiClient }: UseRolesOptions) {
  const [state, setState] = useState<UseRolesState>({
    roles: [],
    rolePreview: undefined,
    loading: true,
    error: undefined,
  });

  const api = createDistributionApi(apiClient);

  const loadRoles = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      const response = await api.listRoles();
      setState((prev) => ({ ...prev, roles: response.items, loading: false }));
    } catch (err) {
      const error = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Failed to load roles');
      setState((prev) => ({ ...prev, error, loading: false }));
    }
  }, [api]);

  const loadRolePreview = useCallback(
    async (role: string) => {
      try {
        const preview = await api.getRolePreview(role);
        setState((prev) => ({ ...prev, rolePreview: preview }));
      } catch {
        setState((prev) => ({ ...prev, rolePreview: undefined }));
      }
    },
    [api]
  );

  const updateRolePermissions = useCallback(
    async (role: string, permissions: string[], etag: string) => {
      const updated = await api.updateRolePermissions(role, permissions, etag);
      setState((prev) => ({
        ...prev,
        roles: prev.roles.map((r) => (r.role === role ? updated : r)),
      }));
      return updated;
    },
    [api]
  );

  return {
    ...state,
    loadRoles,
    loadRolePreview,
    updateRolePermissions,
  };
}
