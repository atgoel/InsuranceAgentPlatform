import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { Principal } from '../../../kernel/tenancy/principal';
import { Logger } from '../../../kernel/observability/logger';
import { CapabilityManifest, Operation, RouteKind } from '../domain/capability-manifest';
import { CallOutcome } from '../domain/outcome';
import {
  CanonicalQuoteRequest,
  CanonicalQuoteResponse,
  CanonicalProposal,
  SubmissionResult,
  PolicyStatusResult,
  StatusRequest,
  PaymentLinkRequest,
  PaymentLinkResult,
} from '../domain/canonical';
// One row per tenant+idempotencyKey in integration_submission: both the resend barrier and the reconciliation work item.
export interface SubmissionRecord {
  id: string;
  adapterId: string;
  adapterVersion: string; // bound at reserve; never re-routed
  idempotencyKey: string;
  inputHash: string;
  proposalEnc?: string; // FieldCipher-encrypted CanonicalProposal; purged at payload expiry
  statusRequest: StatusRequest; // non-personal target used for GET_STATUS reconciliation
  state: 'SENDING' | 'PENDING' | 'COMPLETED' | 'DEAD_LETTER';
  // SENDING: intent committed, external send in flight (60-second lease)
  // PENDING: send outcome uncertain; GET_STATUS due at nextAttemptAt
  // COMPLETED: insurer answered (direct submit success/failure, or authoritative status from reconciliation)
  // DEAD_LETTER: three failed status queries; barrier kept until resolved
  attempts: number;
  nextAttemptAt?: string;
  leaseUntil?: string;
  lastError?: string;
  outcome?: 'success' | 'failure'; // set when COMPLETED
  resultEnc?: string; // encrypted discriminated terminal result
  resultKind?: 'DIRECT' | 'RECONCILED'; // resultEnc is kept for the life of the record (no separate expiry)
  createdAt: string;
  updatedAt: string;
}
export interface SubmissionRepository {
  reserve(tx: Transaction, record: SubmissionRecord): Promise<{
    created: boolean;
    record: SubmissionRecord;
  }>; // unique tenant+idempotencyKey
  getByKey(tx: Transaction, idempotencyKey: string): Promise<SubmissionRecord | undefined>;
  claimDue(tx: Transaction, now: string, leaseUntil: string, limit: number): Promise<SubmissionRecord[]>; // PENDING due, or SENDING with an expired lease
  save(tx: Transaction, record: SubmissionRecord, expected: {
    state: SubmissionRecord['state'];
    leaseUntil?: string;
  }): Promise<boolean>;
  purgeProposalBefore(tx: Transaction, before: string): Promise<number>;
}
export interface CanonicalCallback {
  schemaVersion: 'v1';
  eventId: string;
  occurredAt: string;
  kind: 'POLICY_STATUS';
  idempotencyKey: string;
  status: PolicyStatusResult;
}
export interface CallbackRepository {
  accept(tx: Transaction, input: {
    callbackId: string;
    adapterId: string;
    adapterVersion: string;
    eventId: string;
    idempotencyKey: string;
    occurredAt: string;
    rawBodyHash: string; // SHA-256 hex of the exact raw bytes; same eventId with a different hash -> CONFLICT
    rawPayloadEnc: string;
    canonicalPayloadEnc: string;
    receivedAt: string;
    expiresAt: string;
  }): Promise<CallbackAcceptResult>;
  purgeExpired(tx: Transaction, now: string): Promise<number>;
}
export interface InsurerAdapter {
  manifest(): CapabilityManifest;
  quote?(ctx: AdapterContext, req: CanonicalQuoteRequest): Promise<CallOutcome<CanonicalQuoteResponse>>;
  submitProposal?(ctx: AdapterContext, p: CanonicalProposal): Promise<CallOutcome<SubmissionResult>>;
  getStatus?(ctx: AdapterContext, ref: {
    idempotencyKey: string;
    insurerRef?: string;
  }): Promise<CallOutcome<PolicyStatusResult>>;
  paymentLink?(ctx: AdapterContext, req: PaymentLinkRequest): Promise<CallOutcome<PaymentLinkResult>>;
  probe(ctx: AdapterContext): Promise<CallOutcome<{
    latencyMs: number;
  }>>;
}
export interface AdapterContext {
  tenantId: string;
  idempotencyKey: string;
  credentials: () => Promise<Record<string, string>>;
  signal: AbortSignal;
  logger: Logger;
}
export interface CredentialVault {
  resolve(tenantId: string, adapterId: string): Promise<Record<string, string>>;
} // secret refs only; never logged
export interface AdapterRegistry {
  all(): InsurerAdapter[];
  get(adapterId: string, version?: string): InsurerAdapter | undefined;
}
export interface GatewayResult<T> {
  route: RouteKind;
  adapterId: string;
  adapterVersion: string;
  reason: 'api_available' | 'file_available' | 'assisted_fallback';
  outcome: CallOutcome<T>;
  instructions?: {
    kind: 'INSURER_PORTAL';
    evidenceRequired: true;
  };
  reconciliationId?: string;
}
export interface IntegrationGatewayPort {
  quote(principal: Principal, input: CanonicalQuoteRequest, idempotencyKey: string): Promise<GatewayResult<CanonicalQuoteResponse>>;
  submitProposal(principal: Principal, input: CanonicalProposal, idempotencyKey: string): Promise<GatewaySubmissionResult>;
  getStatus(principal: Principal, input: StatusRequest, idempotencyKey: string): Promise<GatewayResult<PolicyStatusResult>>;
  paymentLink(principal: Principal, input: PaymentLinkRequest, idempotencyKey: string): Promise<GatewayResult<PaymentLinkResult>>;
}
export interface IntegrationCallEntry {
  id: string;
  adapterId: string;
  adapterVersion: string;
  operation: Operation;
  route: RouteKind;
  idempotencyKey: string;
  outcome: 'success' | 'failure' | 'unknown';
  errorCode?: string;
  latencyMs: number;
  at: string;
}
export interface IntegrationCallLog {
  record(tx: Transaction, entry: IntegrationCallEntry): Promise<void>;
  purgeBefore(tx: Transaction, before: string): Promise<number>;
}
export interface AdapterPin {
  adapterId: string;
  version: string;
  updatedAt: string;
}
export interface PinRepository {
  list(tx: Transaction): Promise<AdapterPin[]>;
  put(tx: Transaction, pin: AdapterPin): Promise<void>;
}
export type ChecklistKind = 'HAPPY_PATH' | 'DECLINE' | 'TIMEOUT' | 'DUPLICATE_CALLBACK' | 'SCHEMA_DRIFT';
export interface Certification {
  adapterId: string;
  adapterVersion: string;
  status: 'PASSED' | 'FAILED';
  checkedAt: string;
  checks: Array<{
    kind: ChecklistKind;
    passed: boolean;
    code?: string;
  }>;
}
export interface CertificationRepository {
  get(tx: Transaction, adapterId: string, version: string): Promise<Certification | undefined>;
  save(tx: Transaction, certification: Certification): Promise<void>;
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
export interface DeadLetterRepository {
  get(tx: Transaction, id: string): Promise<DeadLetter | undefined>;
  save(tx: Transaction, entry: DeadLetter): Promise<void>;
  list(tx: Transaction, query: {
    status?: DeadLetter['status'];
    cursor?: string;
    limit: number;
  }): Promise<{
    items: DeadLetter[];
    nextCursor?: string;
  }>;
}
export interface EncryptedPayloadRepository {
  put(tx: Transaction, value: {
    id: string;
    payloadEnc: string;
    expiresAt: string;
  }): Promise<void>;
  get(tx: Transaction, id: string): Promise<{
    payloadEnc: string;
    expiresAt: string;
  } | undefined>;
  purgeBefore(tx: Transaction, before: string): Promise<number>;
}
export interface BreakerSnapshot {
  adapterId: string;
  adapterVersion: string;
  operation: Operation;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  openedAt?: string;
  samples: Array<'success' | 'failure' | 'slow'>;
  halfOpenInFlight: number;
  halfOpenSuccesses: number;
  version: number;
}
export interface BreakerStateStore {
  get(adapterId: string, adapterVersion: string, operation: Operation): Promise<BreakerSnapshot | undefined>;
  save(value: BreakerSnapshot): Promise<void>; // last write wins
}
export interface IntegrationHealthRecord {
  adapterId: string;
  adapterVersion: string;
  probes: Array<{
    at: string;
    outcome: 'success' | 'failure' | 'unknown';
    latencyMs: number;
  }>;
  lastOkAt?: string;
}
export interface IntegrationHealthRepository {
  get(tx: Transaction, adapterId: string, version: string): Promise<IntegrationHealthRecord | undefined>;
  recordProbe(tx: Transaction, adapterId: string, version: string, probe: IntegrationHealthRecord['probes'][number]): Promise<void>;
}
export interface SandboxCertificationRunner {
  run(adapterId: string, adapterVersion: string): Promise<Certification['checks']>;
}
export type InsurerUrlAllowlist = Readonly<Record<string, readonly string[]>>;
export type GatewaySubmissionResult = (GatewayResult<SubmissionResult> & {
  kind: 'DIRECT';
}) | {
  kind: 'RECONCILED';
  route: 'API' | 'FILE';
  adapterId: string;
  adapterVersion: string;
  reconciliationId: string;
  status: PolicyStatusResult;
};
export interface IntegrationCallbackReader {
  get(tx: Transaction, callbackId: string): Promise<CanonicalCallback | undefined>;
}
export interface IntegrationReconciliationReader {
  get(tx: Transaction, reconciliationId: string): Promise<PolicyStatusResult | undefined>;
}
export type CallbackAcceptResult = {
  kind: 'ACCEPTED';
  callbackId: string;
} | {
  kind: 'DUPLICATE';
  callbackId: string;
} | {
  kind: 'STALE';
} | {
  kind: 'CONFLICT';
};
export type ReplayPayload = {
  kind: 'OUTBOUND';
  operation: 'QUOTE' | 'PAYMENT_LINK';
  input: CanonicalQuoteRequest | PaymentLinkRequest;
} | {
  kind: 'SUBMISSION_STATUS';
  reconciliationId: string;
};
export interface RandomSource {
  next(): number;
}
export interface AdapterHealth {
  adapterId: string;
  adapterVersion: string;
  counterparty: CapabilityManifest['counterparty'];
  pin?: AdapterPin;
  certification?: Certification;
  breakers: Array<{
    operation: Operation;
    state: BreakerSnapshot['state'];
  }>;
  lastProbe?: IntegrationHealthRecord['probes'][number] & {
    lastOkAt?: string;
    p95Ms?: number;
  };
}
export const INSURER_ADAPTER = Symbol('InsurerAdapter');
export const ADAPTER_REGISTRY = Symbol('AdapterRegistry');
export const CREDENTIAL_VAULT = Symbol('CredentialVault');
export const INTEGRATION_CALL_LOG = Symbol('IntegrationCallLog');
export const PIN_REPOSITORY = Symbol('PinRepository');
export const CERTIFICATION_REPOSITORY = Symbol('CertificationRepository');
export const DEAD_LETTER_REPOSITORY = Symbol('DeadLetterRepository');
export const ENCRYPTED_PAYLOAD_REPOSITORY = Symbol('EncryptedPayloadRepository');
export const BREAKER_STATE_STORE = Symbol('BreakerStateStore');
export const SUBMISSION_REPOSITORY = Symbol('SubmissionRepository');
export const CALLBACK_REPOSITORY = Symbol('CallbackRepository');
export const INTEGRATION_CALLBACK_READER = Symbol('IntegrationCallbackReader');
export const INTEGRATION_RECONCILIATION_READER = Symbol('IntegrationReconciliationReader');
export const INTEGRATION_HEALTH_REPOSITORY = Symbol('IntegrationHealthRepository');
export const SANDBOX_CERTIFICATION_RUNNER = Symbol('SandboxCertificationRunner');
export const INSURER_URL_ALLOWLIST = Symbol('InsurerUrlAllowlist');
export const RANDOM_SOURCE = Symbol('RandomSource');
export const INTEGRATION_GATEWAY = Symbol('IntegrationGateway');
