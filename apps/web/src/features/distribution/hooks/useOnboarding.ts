import { useState, useCallback } from 'react';
import { ApiError } from '../../../lib/api/api-error';
import { createDistributionApi, OrgUnitNode, MemberDetail, ChecklistItemKey } from '../api';
import { ApiClient } from '../../../lib/api/api-client';

interface UseOnboardingOptions {
  apiClient: ApiClient;
}

interface UseOnboardingState {
  tree: OrgUnitNode | undefined;
  selectedMember: MemberDetail | undefined;
  loading: boolean;
  error: ApiError | undefined;
  activatingMemberId: string | undefined;
  activationError: string | undefined;
  missingItems: ChecklistItemKey[];
}

export function useOnboarding({ apiClient }: UseOnboardingOptions) {
  const [state, setState] = useState<UseOnboardingState>({
    tree: undefined,
    selectedMember: undefined,
    loading: true,
    error: undefined,
    activatingMemberId: undefined,
    activationError: undefined,
    missingItems: [],
  });

  const api = createDistributionApi(apiClient);

  const loadTree = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      const response = await api.getOrgTree();
      setState((prev) => ({ ...prev, tree: response.root, loading: false }));
      return response.root;
    } catch (err) {
      const error = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Failed to load org tree');
      setState((prev) => ({ ...prev, error, loading: false }));
      throw error;
    }
  }, [api]);

  const selectMember = useCallback(
    async (memberId: string) => {
      try {
        const member = await api.getMember(memberId);
        setState((prev) => ({ ...prev, selectedMember: member }));
      } catch (err) {
        const error = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Failed to load member');
        setState((prev) => ({ ...prev, error }));
      }
    },
    [api]
  );

  const activateMember = useCallback(
    async (memberId: string) => {
      try {
        setState((prev) => ({ ...prev, activatingMemberId: memberId, activationError: undefined, missingItems: [] }));

        await api.activateMember(memberId);
        // Reload full member detail
        const updated = await api.getMember(memberId);
        setState((prev) => ({ ...prev, selectedMember: updated, activatingMemberId: undefined }));
        return updated;
      } catch (err) {
        if (
          err instanceof ApiError &&
          err.status === 422 &&
          err.code === 'onboarding_incomplete'
        ) {
          const errorData = err as ApiError & { missing?: ChecklistItemKey[] };
          setState((prev) => ({
            ...prev,
            activatingMemberId: undefined,
            activationError: 'Missing required onboarding items',
            missingItems: errorData.missing || [],
          }));
        } else {
          const message = err instanceof ApiError ? err.title : 'Failed to activate member';
          setState((prev) => ({
            ...prev,
            activatingMemberId: undefined,
            activationError: message,
          }));
        }
        throw err;
      }
    },
    [api]
  );

  return {
    ...state,
    loadTree,
    selectMember,
    activateMember,
  };
}
