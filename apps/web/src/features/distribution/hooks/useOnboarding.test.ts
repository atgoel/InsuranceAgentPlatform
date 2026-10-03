import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ApiClient } from '../../../lib/api/api-client';
import { ApiError } from '../../../lib/api/api-error';
import { useOnboarding } from './useOnboarding';
import { OrgUnitTreeResponse, MemberDetail, ChecklistItemKey } from '../api';

describe('useOnboarding hook', () => {
  let mockApiClient: ApiClient;

  const mockTree: OrgUnitTreeResponse = {
    root: {
      id: 'ou_root',
      kind: 'HEAD_OFFICE',
      name: 'Head Office',
      children: [
        {
          id: 'ou_branch1',
          kind: 'BRANCH',
          name: 'Branch 1',
          memberCount: 5,
          children: [],
        },
      ],
    },
  };

  const mockMember: MemberDetail = {
    id: 'mem_1',
    displayName: 'John Seller',
    phoneMasked: '+91-****-****-1234',
    emailMasked: 'john****@example.com',
    roles: ['SALESPERSON'],
    salespersonType: 'ISP',
    orgUnitId: 'ou_branch1',
    orgUnitName: 'Branch 1',
    status: 'onboarding',
    capacityPerDay: 25,
    skills: [],
    languages: ['en'],
    invitedAt: '2024-01-01T00:00:00Z',
    mfaRequired: false,
    version: 1,
    etag: 'v1',
    checklist: [
      { key: 'IDENTITY_PAN', done: true },
      { key: 'TRAINING', done: false, hoursLogged: 10, hoursRequired: 25 },
      { key: 'EXAM', done: false },
      { key: 'CERTIFICATE', done: false },
      { key: 'INSURER_CODE', done: false },
    ],
    licences: [],
    insurerCodes: [],
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

  it('AC-M02-15 initializes with undefined tree and loading state', () => {
    (mockApiClient.get as Mock).mockResolvedValue(mockTree);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    expect(result.current.tree).toBeUndefined();
    expect(result.current.selectedMember).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('AC-M02-15 loads org tree successfully', async () => {
    (mockApiClient.get as Mock).mockResolvedValue(mockTree);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadTree();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.tree).toEqual(mockTree.root);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('AC-M02-15 handles error loading org tree', async () => {
    const apiError = new ApiError(500, 'server_error', 'Server error');
    (mockApiClient.get as Mock).mockRejectedValue(apiError);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    try {
      act(() => {
        result.current.loadTree().catch(() => {});
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      // Expected to throw
    }

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.code).toBe('server_error');
    expect(result.current.loading).toBe(false);
  });

  it('AC-M02-15 selects a member and loads details', async () => {
    (mockApiClient.get as Mock).mockResolvedValue(mockMember);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    act(() => {
      result.current.selectMember('mem_1');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.selectedMember).toEqual(mockMember);
  });

  it('AC-M02-15 handles error selecting a member', async () => {
    const apiError = new ApiError(404, 'not_found', 'Member not found');
    (mockApiClient.get as Mock).mockRejectedValue(apiError);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    act(() => {
      result.current.selectMember('mem_invalid');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.code).toBe('not_found');
    expect(result.current.selectedMember).toBeUndefined();
  });

  it('AC-M02-04 activates member successfully when checklist is complete', async () => {
    const completeMember: MemberDetail = {
      ...mockMember,
      status: 'active',
      checklist: mockMember.checklist?.map((item) => ({ ...item, done: true })),
    };

    (mockApiClient.post as Mock).mockResolvedValue(completeMember);
    (mockApiClient.get as Mock).mockResolvedValue(completeMember);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    act(() => {
      result.current.selectMember('mem_1');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    act(() => {
      result.current.activateMember('mem_1');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.selectedMember?.status).toBe('active');
    expect(result.current.activationError).toBeUndefined();
    expect(result.current.missingItems).toHaveLength(0);
  });

  it('AC-M02-04 handles 422 onboarding_incomplete error with missing items', async () => {
    const error = new ApiError(422, 'onboarding_incomplete', 'Onboarding incomplete') as ApiError & { missing?: ChecklistItemKey[] };
    error.missing = ['TRAINING', 'CERTIFICATE'];

    (mockApiClient.post as Mock).mockRejectedValue(error);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    act(() => {
      result.current.selectMember('mem_1');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      act(() => {
        result.current.activateMember('mem_1').catch(() => {});
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      // Expected to throw
    }

    expect(result.current.activationError).toBe('Missing required onboarding items');
    expect(result.current.missingItems).toEqual(['TRAINING', 'CERTIFICATE']);
  });

  it('AC-M02-04 handles other API errors during activation', async () => {
    const apiError = new ApiError(500, 'server_error', 'Server error');
    (mockApiClient.post as Mock).mockRejectedValue(apiError);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    act(() => {
      result.current.selectMember('mem_1');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      act(() => {
        result.current.activateMember('mem_1').catch(() => {});
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      // Expected to throw
    }

    expect(result.current.activationError).toBeDefined();
    expect(result.current.activationError).toContain('Server error');
  });

  it('AC-M02-15 resets activation state when activating a new member', async () => {
    const error = new ApiError(422, 'onboarding_incomplete', 'Onboarding incomplete') as ApiError & { missing?: ChecklistItemKey[] };
    error.missing = ['TRAINING'];

    (mockApiClient.post as Mock).mockRejectedValueOnce(error);

    const completeMember: MemberDetail = {
      ...mockMember,
      status: 'active',
      checklist: mockMember.checklist?.map((item) => ({ ...item, done: true })),
    };

    (mockApiClient.post as Mock).mockResolvedValueOnce(completeMember);
    (mockApiClient.get as Mock).mockResolvedValue(completeMember);

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    // First attempt - should fail
    try {
      act(() => {
        result.current.activateMember('mem_1').catch(() => {});
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      // Expected to throw
    }

    expect(result.current.activationError).toBeDefined();
    expect(result.current.missingItems).toHaveLength(1);

    // Second attempt - should succeed and clear error
    act(() => {
      result.current.activateMember('mem_1');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.activationError).toBeUndefined();
    expect(result.current.missingItems).toHaveLength(0);
  });

  it('AC-M02-15 handles non-ApiError during activation', async () => {
    (mockApiClient.post as Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useOnboarding({ apiClient: mockApiClient }));

    try {
      act(() => {
        result.current.activateMember('mem_1').catch(() => {});
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      // Expected to throw
    }

    expect(result.current.activationError).toBeDefined();
  });
});
