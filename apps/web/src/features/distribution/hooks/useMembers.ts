import { useState, useCallback, useMemo } from 'react';
import { ApiError } from '../../../lib/api/api-error';
import { createDistributionApi, MemberView, SalespersonType } from '../api';
import { ApiClient } from '../../../lib/api/api-client';

interface UseMembersOptions {
  apiClient: ApiClient;
}

interface UseMembersState {
  members: MemberView[];
  loading: boolean;
  error: ApiError | undefined;
}

export function useMembers({ apiClient }: UseMembersOptions) {
  const [state, setState] = useState<UseMembersState>({
    members: [],
    loading: true,
    error: undefined,
  });

  const api = useMemo(() => createDistributionApi(apiClient), [apiClient]);

  const loadMembers = useCallback(
    async (filter?: Parameters<typeof api.listMembers>[0]) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: undefined }));
        const response = await api.listMembers(filter);
        setState((prev) => ({ ...prev, members: response.items, loading: false }));
      } catch (err) {
        const error = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Failed to load members');
        setState((prev) => ({ ...prev, error, loading: false }));
      }
    },
    [api]
  );

  const inviteMember = useCallback(
    async (input: {
      displayName: string;
      phone?: string;
      email?: string;
      roles: string[];
      salespersonType?: SalespersonType;
      orgUnitId: string;
    }) => {
      const newMember = await api.inviteMember(input);
      setState((prev) => ({ ...prev, members: [...prev.members, newMember] }));
      return newMember;
    },
    [api]
  );

  const transitionMemberStatus = useCallback(
    async (id: string, to: 'active' | 'suspended', reason: string) => {
      const updated = await api.transitionMemberStatus(id, to, reason);
      setState((prev) => ({
        ...prev,
        members: prev.members.map((m) => (m.id === id ? updated : m)),
      }));
      return updated;
    },
    [api]
  );

  return {
    ...state,
    loadMembers,
    inviteMember,
    transitionMemberStatus,
  };
}
