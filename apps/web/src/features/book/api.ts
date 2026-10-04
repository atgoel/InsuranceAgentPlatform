import type { ApiClient } from '../../lib/api/api-client';
import type { CustomFieldValues } from '../tenancy/api';

export interface Commercials {
  line: string; category: string; businessType: string; bookedOn: string; commencementDate: string;
  expiryDate?: string; premiumNetPaise: number; premiumTaxPaise: number; premiumGrossPaise: number;
  previousInsurerName?: string; bookingChannelCode?: string; businessSource?: string; remarks?: string;
  referredBy?: { name: string; memberId?: string; partyId?: string };
}
export interface HeldPolicyView {
  id: string; holderName: string; proposerPartyId: string; insurerName: string; productName: string;
  line: string; policyNumber: string; premiumPaise: number; mode: string; status: string; source: string;
  asOf: string; confidence: string; version: number; commercials: Commercials;
  registrationNoLast4?: string; risk?: { schemaId: string; schemaVersion: number; details: Record<string, unknown> };
  customFields: CustomFieldValues;
}
export interface DueItem {
  policyId: string; holderName: string; productName: string; dueDate: string; status: string;
  amountPaise: number; graceEndsOn?: string; line: string; source: string; asOf: string; confidence: string;
}
export interface ServicingRequest {
  id: string; heldPolicyId: string; kind: string; status: string; insurerRef?: string; followUpOn?: string;
  portalUrl?: string; version: number; notes: Array<{ at: string; by: string; text: string }>;
}
export interface PolicyDetail extends HeldPolicyView {
  schedule: Array<{ dueDate: string; amountPaise: number }>;
  due: { status: string; dueDate?: string; graceEndsOn?: string }; servicingRequests: ServicingRequest[];
}
export interface ImportRow {
  rowNo: number; raw?: Record<string, string>; parsed?: Record<string, unknown>; problems: string[]; warnings?: string[];
  match?: { kind: string; heldPolicyId?: string }; decision?: 'IMPORT' | 'SKIP' | 'UPDATE';
  referrerSuggestions?: Array<{ name?: string; memberId?: string; partyId?: string }>;
}
export interface ImportBatch {
  id: string; state: string; asOf: string; format: string; suggestedMapping: Record<string, string>;
  mapping: Record<string, string>; summary: { total: number; problems: number; duplicates: number; updates: number };
}
export interface ImportResult { imported: number; updated: number; skipped: number; parties: { created: number; linked: number } }
const root = '/api/v1';
export function createBookApi(api: ApiClient) {
  return {
    policies: (partyId?: string) => api.get<{ items: HeldPolicyView[] }>(`${root}/held-policies`, { query: { partyId } }),
    policy: (id: string) => api.get<PolicyDetail>(`${root}/held-policies/${id}`),
    dues: (from: string, to: string) => api.get<{ days: Array<{ date: string; dues: DueItem[] }> }>(`${root}/dues`, { query: { from, to } }),
    pay: (id: string, installmentDue: string, paidOn: string) => api.post(`${root}/held-policies/${id}/payments`, { installmentDue, paidOn }),
    updatePolicy: (id: string, customFields: CustomFieldValues, version: number) => api.patch<HeldPolicyView>(`${root}/held-policies/${id}`, { customFields }, { ifMatch: `"v${version}"` }),
    upload: (format: string, fileChecksum: string, asOf: string, rows: Record<string, string>[]) => api.post<ImportBatch>(`${root}/book-imports`, { format, fileChecksum, asOf, rows }),
    batch: (id: string) => api.get<ImportBatch>(`${root}/book-imports/${id}`),
    map: (id: string, mapping: Record<string, string>) => api.put<ImportBatch>(`${root}/book-imports/${id}/mapping`, { mapping }),
    rows: (id: string, filter: string) => api.get<{ items: ImportRow[] }>(`${root}/book-imports/${id}/rows`, { query: { filter } }),
    decide: (id: string, rowNo: number, decision: string) => api.put(`${root}/book-imports/${id}/rows/${rowNo}/decision`, { decision }),
    referrer: (id: string, rowNo: number, link: { memberId?: string; partyId?: string }) => api.put(`${root}/book-imports/${id}/rows/${rowNo}/referrer`, link),
    commit: (id: string) => api.post<ImportResult>(`${root}/book-imports/${id}/commit`),
    servicing: (followUpBefore: string) => api.get<{ items: ServicingRequest[] }>(`${root}/servicing-requests`, { query: { followUpBefore } }),
    createRequest: (id: string, input: { kind: string; insurerRef?: string; followUpOn?: string; portalUrl?: string }) => api.post<ServicingRequest>(`${root}/held-policies/${id}/servicing-requests`, input),
    transition: (r: ServicingRequest, status: string) => api.patch<ServicingRequest>(`${root}/servicing-requests/${r.id}`, { status }, { ifMatch: `"v${r.version}"` }),
    note: (id: string, text: string) => api.post<ServicingRequest>(`${root}/servicing-requests/${id}/notes`, { text }),
  };
}
export type BookApi = ReturnType<typeof createBookApi>;
