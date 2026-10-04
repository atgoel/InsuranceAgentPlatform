import type { ApiClient } from '../../lib/api/api-client';

export type Operation = 'QUOTE' | 'SUBMIT_PROPOSAL' | 'GET_STATUS' | 'PAYMENT_LINK' | 'POLICY_DOCUMENT' | 'COMMISSION_STATEMENT' | 'RENEWAL_NOTICE';
export interface AdapterPin {
  adapterId: string;
  version: string;
  updatedAt: string;
}
export interface Certification {
  adapterId: string;
  adapterVersion: string;
  status: 'PASSED' | 'FAILED';
  checkedAt: string;
  checks: Array<{ kind: 'HAPPY_PATH' | 'DECLINE' | 'TIMEOUT' | 'DUPLICATE_CALLBACK' | 'SCHEMA_DRIFT'; passed: boolean; code?: string }>;
}
export interface AdapterHealth {
  adapterId: string;
  adapterVersion: string;
  counterparty: { kind: 'INSURER' | 'VENDOR'; insurerId?: string; name: string };
  pin?: AdapterPin;
  certification?: Certification;
  breakers: Array<{ operation: Operation; state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' }>;
  lastProbe?: { at: string; outcome: 'success' | 'failure' | 'unknown'; latencyMs: number; lastOkAt?: string; p95Ms?: number };
}
export interface DeadLetter {
  id: string;
  adapterId: string;
  adapterVersion: string;
  operation: Operation;
  idempotencyKey: string;
  payloadRef: string;
  lastError: string;
  attempts: number;
  ownerTeam: 'INTEGRATION_OPS';
  status: 'OPEN' | 'REPLAYED' | 'DISCARDED';
  createdAt: string;
  payloadExpiresAt: string;
  discardReason?: string;
  replayedFromId?: string;
}
export interface DeadLetterDetail {
  entry: DeadLetter;
  payload?: unknown;
  payloadExpired: boolean;
}
export interface ReplayResult {
  id: string;
  status: 'REPLAYED';
  result: 'SUCCEEDED' | 'FAILED';
  replacementId?: string;
}
const base = '/api/v1/integrations';
export function createIntegrationsApi(api: ApiClient) {
  return {
    list: () => api.get<{ items: AdapterHealth[] }>(base),
    pin: (id: string, version: string) => api.put<AdapterPin>(`${base}/${encodeURIComponent(id)}/pin`, { version }),
    certify: (id: string, key: string) => api.post<Certification>(`${base}/${encodeURIComponent(id)}/certifications`, undefined, { idempotencyKey: key }),
    letters: (status?: DeadLetter['status'], cursor?: string) =>
      api.get<{ items: DeadLetter[]; nextCursor?: string }>(`${base}/dead-letters`, { query: { status, cursor, limit: 25 } }),
    detail: (id: string) => api.get<DeadLetterDetail>(`${base}/dead-letters/${encodeURIComponent(id)}`),
    replay: (id: string, key: string) =>
      api.post<ReplayResult>(`${base}/dead-letters/${encodeURIComponent(id)}/replay`, undefined, { idempotencyKey: key }),
    discard: (id: string, reason: string, key: string) =>
      api.post<{ id: string; status: 'DISCARDED' }>(`${base}/dead-letters/${encodeURIComponent(id)}/discard`, { reason }, { idempotencyKey: key }),
  };
}
export type IntegrationsApi = ReturnType<typeof createIntegrationsApi>;
