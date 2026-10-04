import type { MemberDetail, MemberView, RoleDefinition } from './api';

/** A member view with sensible defaults; tests override only what they assert on. */
export function member(over: Partial<MemberView> = {}): MemberView {
  return {
    id: 'mem_1',
    displayName: 'Alice Manager',
    phoneMasked: '+91-****-****-1111',
    roles: ['BRANCH_MANAGER'],
    orgUnitId: 'ou_branch1',
    orgUnitName: 'Andheri',
    status: 'active',
    capacityPerDay: 25,
    skills: [],
    languages: ['en'],
    invitedAt: '2026-01-01T00:00:00Z',
    mfaRequired: true,
    version: 1,
    etag: 'v1',
    ...over,
  };
}

export function memberDetail(over: Partial<MemberDetail> = {}): MemberDetail {
  return { ...member({ status: 'onboarding', salespersonType: 'ISP' }), licences: [], insurerCodes: [], ...over };
}

export function role(over: Partial<RoleDefinition> = {}): RoleDefinition {
  return {
    role: 'BRANCH_MANAGER',
    version: 2,
    permissions: ['distribution.member.read'],
    recordScope: 'UNIT_SUBTREE',
    privileged: true,
    editable: true,
    etag: 'v2',
    ...over,
  };
}
