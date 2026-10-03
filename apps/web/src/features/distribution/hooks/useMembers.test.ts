import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ApiClient } from '../../../lib/api/api-client';
import { ApiError } from '../../../lib/api/api-error';
import { useMembers } from './useMembers';
import { MemberView, ListMembersResponse } from '../api';

describe('useMembers hook', () => {
  let mockApiClient: ApiClient;

  const mockMember: MemberView = {
    id: 'mem_1',
    displayName: 'John Seller',
    phoneMasked: '+91-****-****-1234',
    emailMasked: 'john****@example.com',
    roles: ['SALESPERSON'],
    salespersonType: 'ISP',
    orgUnitId: 'ou_branch1',
    orgUnitName: 'Branch 1',
    status: 'active',
    capacityPerDay: 25,
    skills: ['LIFE'],
    languages: ['en'],
    invitedAt: '2024-01-01T00:00:00Z',
    activatedAt: '2024-01-05T00:00:00Z',
    mfaRequired: false,
    version: 1,
    etag: 'v1',
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

  it('AC-M02-10 initializes with empty members and loading state', () => {
    (mockApiClient.get as Mock).mockResolvedValue({ items: [] } as ListMembersResponse);

    const { result } = renderHook(() => useMembers({ apiClient: mockApiClient }));

    expect(result.current.members).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('AC-M02-10 loads members successfully and updates state', async () => {
    const mockResponse: ListMembersResponse = {
      items: [mockMember],
    };
    (mockApiClient.get as Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useMembers({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadMembers();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.members).toEqual([mockMember]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('AC-M02-10 handles API errors and maps to ApiError', async () => {
    const apiError = new ApiError(500, 'server_error', 'Server error');
    (mockApiClient.get as Mock).mockRejectedValue(apiError);

    const { result } = renderHook(() => useMembers({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadMembers();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.code).toBe('server_error');
    expect(result.current.loading).toBe(false);
  });

  it('AC-M02-10 filters members by status', async () => {
    const mockResponse: ListMembersResponse = {
      items: [{ ...mockMember, status: 'active' }],
    };
    (mockApiClient.get as Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useMembers({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadMembers({ status: 'active' });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect((mockApiClient.get as Mock).mock.calls[0][1]).toEqual({
      query: {
        status: 'active',
        role: undefined,
        orgUnitId: undefined,
        salespersonType: undefined,
        q: undefined,
        limit: undefined,
        cursor: undefined,
      },
    });
  });

  it('AC-M02-10 invites a new member and updates state', async () => {
    const newMember: MemberView = { ...mockMember, id: 'mem_2', displayName: 'Jane Seller' };
    (mockApiClient.get as Mock).mockResolvedValue({ items: [] } as ListMembersResponse);
    (mockApiClient.post as Mock).mockResolvedValue(newMember);

    const { result } = renderHook(() => useMembers({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadMembers();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    act(() => {
      result.current.inviteMember({
        displayName: 'Jane Seller',
        phone: '+91-1234-5678-9012',
        roles: ['SALESPERSON'],
        orgUnitId: 'ou_branch1',
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.members).toContain(newMember);
  });

  it('AC-M02-06 transitions member status and updates state', async () => {
    const updatedMember: MemberView = { ...mockMember, status: 'suspended' };
    (mockApiClient.get as Mock).mockResolvedValue({ items: [mockMember] } as ListMembersResponse);
    (mockApiClient.post as Mock).mockResolvedValue(updatedMember);

    const { result } = renderHook(() => useMembers({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadMembers();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    act(() => {
      result.current.transitionMemberStatus('mem_1', 'suspended', 'Performance issues');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.members[0].status).toBe('suspended');
  });

  it('AC-M02-10 handles unknown error types', async () => {
    (mockApiClient.get as Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMembers({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadMembers();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.code).toBe('unknown');
    expect(result.current.loading).toBe(false);
  });

  it('AC-M02-10 respects filter with org unit, role, and salesperson type', async () => {
    (mockApiClient.get as Mock).mockResolvedValue({ items: [] } as ListMembersResponse);

    const { result } = renderHook(() => useMembers({ apiClient: mockApiClient }));

    act(() => {
      result.current.loadMembers({
        orgUnitId: 'ou_branch1',
        role: 'SALESPERSON',
        salespersonType: 'ISP',
        q: 'John',
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect((mockApiClient.get as Mock).mock.calls[0][1]).toEqual({
      query: {
        status: undefined,
        role: 'SALESPERSON',
        orgUnitId: 'ou_branch1',
        salespersonType: 'ISP',
        q: 'John',
        limit: undefined,
        cursor: undefined,
      },
    });
  });
});
