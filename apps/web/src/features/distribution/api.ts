import { ApiClient } from '../../lib/api/api-client';

// Types from spec §3-6

export type MemberStatus = 'invited' | 'onboarding' | 'active' | 'suspended' | 'exited';
export type SalespersonType = 'EMPLOYEE' | 'ISP' | 'POSP' | 'SOLO';
export type OrgUnitKind = 'HEAD_OFFICE' | 'REGION' | 'BRANCH' | 'TEAM';
export type ChecklistItemKey = 'IDENTITY_PAN' | 'TRAINING' | 'EXAM' | 'CERTIFICATE' | 'INSURER_CODE';
export type LicenceKind = 'POSP_LIFE' | 'POSP_GENERAL' | 'ISP' | 'INDIVIDUAL_AGENT' | 'OTHER';
export type RecordScopeKind = 'OWN' | 'UNIT_SUBTREE' | 'TENANT';

export interface OrgUnit {
  id: string;
  parentId?: string;
  kind: OrgUnitKind;
  name: string;
  territoryCodes?: string[];
}

export interface OrgUnitNode extends OrgUnit {
  children: OrgUnitNode[];
  memberCount?: number;
}

export interface OrgUnitTreeResponse {
  root: OrgUnitNode;
}

export interface ChecklistItem {
  key: ChecklistItemKey;
  done: boolean;
  evidenceRef?: string;
  note?: string;
  hoursLogged?: number;
  hoursRequired?: number;
  completedAt?: string;
}

export interface Licence {
  id: string;
  memberId: string;
  kind: LicenceKind;
  number: string;
  validFrom: string;
  validTo: string;
  verifiedAt?: string;
}

export interface MemberView {
  id: string;
  displayName: string;
  phoneMasked?: string;
  emailMasked?: string;
  roles: string[];
  salespersonType?: SalespersonType;
  orgUnitId: string;
  orgUnitName?: string;
  status: MemberStatus;
  capacityPerDay: number;
  skills: string[];
  languages: string[];
  invitedAt: string;
  activatedAt?: string;
  mfaRequired: boolean;
  version: number;
  etag: string;
}

export interface MemberDetail extends MemberView {
  checklist?: ChecklistItem[];
  licences: Licence[];
  insurerCodes: Array<{ insurerId: string; code: string }>;
}

export interface ListMembersResponse {
  items: MemberView[];
  nextCursor?: string;
}

export interface RoleDefinition {
  role: string;
  version: number;
  permissions: string[];
  recordScope: RecordScopeKind;
  privileged: boolean;
  editable: boolean;
  etag: string;
}

export interface RolePreview {
  role: string;
  sees: string[];
}

export interface ListRolesResponse {
  items: RoleDefinition[];
}

export interface ExpiringLicence extends Licence {
  memberName: string;
  daysLeft: number;
}

export interface ExpiringLicencesResponse {
  items: ExpiringLicence[];
}

export interface OnboardingIncompleteError {
  code: 'onboarding_incomplete';
  missing: ChecklistItemKey[];
}

// Idempotency key helper (crypto.randomUUID replacement for older envs)
const newIdempotencyKey = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export function createDistributionApi(apiClient: ApiClient) {
  return {
    // Org units
    async getOrgTree(): Promise<OrgUnitTreeResponse> {
      return apiClient.get('/api/v1/org-units');
    },

    async createOrgUnit(input: {
      parentId: string;
      kind: Exclude<OrgUnitKind, 'HEAD_OFFICE'>;
      name: string;
      territoryCodes?: string[];
    }): Promise<OrgUnit> {
      return apiClient.post('/api/v1/org-units', input, { idempotencyKey: newIdempotencyKey() });
    },

    async moveOrgUnit(id: string, parentId: string): Promise<OrgUnit> {
      return apiClient.post(`/api/v1/org-units/${id}/moves`, { parentId }, { idempotencyKey: newIdempotencyKey() });
    },

    // Members
    async listMembers(filter?: {
      status?: MemberStatus;
      role?: string;
      orgUnitId?: string;
      salespersonType?: SalespersonType;
      q?: string;
      limit?: number;
      cursor?: string;
    }): Promise<ListMembersResponse> {
      return apiClient.get('/api/v1/members', {
        query: {
          status: filter?.status,
          role: filter?.role,
          orgUnitId: filter?.orgUnitId,
          salespersonType: filter?.salespersonType,
          q: filter?.q,
          limit: filter?.limit,
          cursor: filter?.cursor,
        },
      });
    },

    async inviteMember(input: {
      displayName: string;
      phone?: string;
      email?: string;
      roles: string[];
      salespersonType?: SalespersonType;
      orgUnitId: string;
    }): Promise<MemberView> {
      return apiClient.post('/api/v1/members', input, { idempotencyKey: newIdempotencyKey() });
    },

    async getMember(id: string): Promise<MemberDetail> {
      return apiClient.get(`/api/v1/members/${id}`);
    },

    async updateMember(
      id: string,
      input: {
        roles?: string[];
        orgUnitId?: string;
        capacityPerDay?: number;
        skills?: string[];
        languages?: string[];
      },
      etag: string
    ): Promise<MemberView> {
      return apiClient.patch(`/api/v1/members/${id}`, input, { ifMatch: etag });
    },

    async transitionMemberStatus(
      id: string,
      to: 'active' | 'suspended',
      reason: string
    ): Promise<MemberView> {
      return apiClient.post(`/api/v1/members/${id}/status-transitions`, { to, reason }, { idempotencyKey: newIdempotencyKey() });
    },

    async exitMember(id: string, input: { transferToMemberId?: string; reason: string }): Promise<MemberView> {
      return apiClient.post(`/api/v1/members/${id}/exit`, input, { idempotencyKey: newIdempotencyKey() });
    },

    // Onboarding
    async recordEvidence(
      memberId: string,
      key: ChecklistItemKey,
      input: { evidenceRef: string; note?: string }
    ): Promise<{ checklist: ChecklistItem[] }> {
      return apiClient.post(
        `/api/v1/members/${memberId}/onboarding/evidence`,
        { key, ...input },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async logTraining(memberId: string, input: { hours: number; evidenceRef: string }): Promise<{ checklist: ChecklistItem[] }> {
      return apiClient.post(`/api/v1/members/${memberId}/onboarding/training`, input, { idempotencyKey: newIdempotencyKey() });
    },

    async setInsurerCode(memberId: string, insurerId: string, code: string): Promise<{ insurerId: string; code: string }> {
      return apiClient.put(`/api/v1/members/${memberId}/insurer-codes/${insurerId}`, { code });
    },

    async activateMember(memberId: string): Promise<MemberView> {
      return apiClient.post(`/api/v1/members/${memberId}/activation`, {}, { idempotencyKey: newIdempotencyKey() });
    },

    // Licences
    async recordLicence(memberId: string, licence: Omit<Licence, 'id' | 'memberId'>): Promise<Licence> {
      return apiClient.post(`/api/v1/members/${memberId}/licences`, licence, { idempotencyKey: newIdempotencyKey() });
    },

    async listExpiringLicences(withinDays?: number): Promise<ExpiringLicencesResponse> {
      return apiClient.get('/api/v1/licences/expiring', { query: { withinDays: withinDays ?? 60 } });
    },

    // Roles
    async listRoles(): Promise<ListRolesResponse> {
      return apiClient.get('/api/v1/roles');
    },

    async getRolePreview(role: string): Promise<RolePreview> {
      return apiClient.get(`/api/v1/roles/${role}/preview`);
    },

    async updateRolePermissions(role: string, permissions: string[], etag: string): Promise<RoleDefinition> {
      return apiClient.put(`/api/v1/roles/${role}/permissions`, { permissions }, { ifMatch: etag });
    },
  };
}

export type DistributionApi = ReturnType<typeof createDistributionApi>;
