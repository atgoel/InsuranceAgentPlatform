import { ApiClient } from '../../lib/api/api-client';
import type { CustomFieldValues } from '../tenancy/api';

// Party types from spec §3
export type PartyKind = 'PERSON' | 'ORGANISATION';
export type PartyStatus = 'ACTIVE' | 'MERGED' | 'ERASED';
export type Language = 'en' | 'hi' | string;
export type Channel = 'MOBILE' | 'EMAIL';
export type PreferredChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL';
export type ConsentPurpose = 'SERVICE' | 'MARKETING' | 'AI_PROCESSING' | 'DATA_SHARING_INSURER';
export type ConsentChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL' | 'ANY';

export interface ContactPoint {
  channel: Channel;
  masked: string;
  isPrimary: boolean;
  verified: boolean;
}

export interface PartyView {
  id: string;
  kind: PartyKind;
  displayName: string;
  contacts: ContactPoint[];
  dobYear?: number;
  panLast4?: string;
  preferredLanguage: Language;
  preferredChannel?: PreferredChannel;
  ownerMemberId?: string;
  tags: string[];
  source: { kind: string; ref?: string };
  status: PartyStatus;
  createdAt: string;
  version: number;
  /** Absent on payloads from before CR-001. */
  customFields?: CustomFieldValues;
}

export interface PartyListItem {
  id: string;
  displayName: string;
  primaryMobileMasked?: string;
  householdName?: string;
  rolesSummary: string[];
  tags: string[];
  ownerMemberId?: string;
}

export interface HouseholdMember {
  partyId: string;
  relation: 'SELF' | 'SPOUSE' | 'CHILD' | 'PARENT' | 'SIBLING' | 'OTHER';
}

export interface HouseholdView {
  id: string;
  name: string;
  headPartyId: string;
  members: HouseholdMember[];
}

export interface PartyRoleLink {
  partyId: string;
  role: 'PROPOSER' | 'INSURED' | 'PAYER' | 'NOMINEE' | 'LIFE_ASSURED';
  subjectType: 'HELD_POLICY' | 'PROPOSAL';
  subjectId: string;
  label?: string;
  createdAt: string;
}

export interface ConsentSummaryItem {
  purpose: ConsentPurpose;
  channel: ConsentChannel;
  granted: boolean;
  occurredAt: string;
  noticeVersion: string;
}

export interface ConsentRecord {
  id: string;
  purpose: ConsentPurpose;
  channel: ConsentChannel;
  granted: boolean;
  noticeVersion: string;
  source: 'WEB_FORM' | 'ASSISTED' | 'IMPORT' | 'CUSTOMER_LINK' | 'SIGNUP';
  evidenceRef?: string;
  capturedBy: string;
  occurredAt: string;
}

export interface ContactabilityDecision {
  allowed: boolean;
  reason: 'ok' | 'party_inactive' | 'no_contact_point' | 'suppressed' | 'consent_missing' | 'consent_withdrawn';
  detail?: { suppressionReason?: string; consentRecordId?: string };
}

export interface DuplicateCandidateView {
  id: string;
  a: PartyListItem;
  b: PartyListItem;
  score: number;
  rule: string;
  explanation: string;
}

export interface ComparisonField {
  field: string;
  a: unknown;
  b: unknown;
}

export interface ComparisonResponse {
  fields: ComparisonField[];
  sourceA: { kind: string; ref?: string };
  sourceB: { kind: string; ref?: string };
}

export type SurvivorChoice = { field: string; from: 'A' | 'B' };

export interface MergeResult {
  mergeId: string;
  survivorId: string;
  mergedId: string;
  reversibleUntil: string;
}

const newIdempotencyKey = () => crypto.randomUUID();

export function createPartyApi(apiClient: ApiClient) {
  return {
    // Customers list and search (CRM04)
    async listParties(filter?: {
      q?: string;
      tag?: string;
      householdId?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{ items: PartyListItem[]; nextCursor?: string }> {
      return apiClient.get('/api/v1/parties', {
        query: {
          q: filter?.q,
          tag: filter?.tag,
          householdId: filter?.householdId,
          limit: filter?.limit ?? 25,
          cursor: filter?.cursor,
        },
      });
    },

    // Customer record detail (CRM09)
    async getParty(id: string): Promise<
      PartyView & {
        household?: HouseholdView;
        roles: PartyRoleLink[];
        consentSummary: ConsentSummaryItem[];
      }
    > {
      return apiClient.get(`/api/v1/parties/${id}`);
    },

    async replacePartyCustomFields(id: string, customFields: Record<string, string | number | boolean | null>, version: number): Promise<PartyView> {
      return apiClient.put(`/api/v1/parties/${id}/custom-fields`, { customFields }, { ifMatch: `"v${version}"` });
    },

    // Contactability check
    async checkContactability(
      id: string,
      channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL',
      purpose: ConsentPurpose
    ): Promise<ContactabilityDecision> {
      return apiClient.get(`/api/v1/parties/${id}/contactability`, {
        query: { channel, purpose },
      });
    },

    // Consent ledger
    async getConsents(id: string): Promise<{
      summary: ConsentSummaryItem[];
      history: ConsentRecord[];
    }> {
      return apiClient.get(`/api/v1/parties/${id}/consents`);
    },

    // Record consent
    async recordConsent(
      id: string,
      input: {
        purpose: ConsentPurpose;
        channel: ConsentChannel;
        granted: boolean;
        noticeVersion: string;
        source: string;
      }
    ): Promise<ConsentRecord> {
      return apiClient.post(`/api/v1/parties/${id}/consents`, input, {
        idempotencyKey: newIdempotencyKey(),
      });
    },

    // Duplicate queue (CRM08)
    async listDuplicates(filter?: {
      limit?: number;
      cursor?: string;
    }): Promise<{ items: DuplicateCandidateView[]; nextCursor?: string }> {
      return apiClient.get('/api/v1/duplicates', {
        query: {
          limit: filter?.limit ?? 25,
          cursor: filter?.cursor,
        },
      });
    },

    async getDuplicateComparison(id: string): Promise<ComparisonResponse> {
      return apiClient.get(`/api/v1/duplicates/${id}/comparison`);
    },

    async mergeDuplicates(
      id: string,
      input: { survivor: 'A' | 'B'; choices: SurvivorChoice[] }
    ): Promise<MergeResult> {
      return apiClient.post(`/api/v1/duplicates/${id}/merge`, input, {
        idempotencyKey: newIdempotencyKey(),
      });
    },

    async dismissDuplicate(id: string): Promise<void> {
      return apiClient.post(`/api/v1/duplicates/${id}/dismissal`, {}, {
        idempotencyKey: newIdempotencyKey(),
      });
    },
  };
}

export type PartyApi = ReturnType<typeof createPartyApi>;
