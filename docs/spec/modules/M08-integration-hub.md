# M08 · Integration Hub — low-level design

Status: Contract clarification draft — pending user review · Depends on: M00 (kernel), M01 (tenant directory for per-tenant adapter pins and credentials refs) · Requirements: Rev 3.0 F18 (API quote/submission/issuance; assisted route always available), F57–F59 (gated vendors on the same SPI) · HLD D6, §9 "Adapter SPI" and "Reliability contract for every external call", §12 failure table (insurer API down → assisted with banner), §16 business monitors (dead-letter depth) · Screens: W12 `Integrations` (adapter health board, DLQ operations)

Proposed corrections and complete contracts are in §11 and [ADR-M08-contract-clarifications](../../adr/ADR-M08-contract-clarifications.md). They are a review draft, not implementation authorization. Upon approval, §11 supersedes conflicting shorthand in §§3–7; merge those corrections into the original sections before building.

## 1. Responsibilities

The only component that talks to insurers and vendors. Domain modules (M06 quotes, M09 proposals, M10 statements, M07 status sync) call **capabilities** on a canonical model — never a named insurer:

- **Adapter SPI** with a **capability manifest** per adapter and line; runtime **route selection** (API → file → assisted).
- **Reliability contract**: business idempotency keys reused on every retry; timeouts become **unknown outcomes** that trigger a status query before any resubmission; per-counterparty **bulkhead** and **circuit breaker**; exponential backoff with jitter; **dead-letter queue** after three strikes with an operations screen and replay.
- **Inbound callbacks**: signature/mTLS verification, replay window, inbox deduplication, raw payload retention (180 days), stale-transition rejection.
- **Assisted adapter**: an operator records a portal transaction with evidence — always available, so selling never depends on an API.
- **Health**: synthetic probes every 5 minutes feeding the breaker and the health board.

Portal scraping is prohibited (no adapter kind for it).

## 2. Module layout
```
apps/core/src/modules/integration/
  domain/
    canonical.ts            CanonicalQuoteRequest/Response, CanonicalProposal, SubmissionResult, PolicyStatusResult, CommissionStatement (versioned 'v1')
    capability-manifest.ts  CapabilityManifest, Operation, RouteKind, ManifestValidator
    route-selector.ts       RouteSelector (Strategy: API → FILE → ASSISTED; skips open breakers / disabled certifications)
    circuit-breaker.ts      CircuitBreaker (State: CLOSED → OPEN → HALF_OPEN), BreakerPolicy
    bulkhead.ts             Bulkhead (per counterparty concurrency + bounded queue)
    retry-policy.ts         RetryPolicy (exponential + full jitter; retryable classification)
    outcome.ts              CallOutcome = Success | Failure(retryable?) | Unknown
    dead-letter.ts          DeadLetter aggregate (OPEN → REPLAYED | DISCARDED)
    callback-verifier.ts    HmacCallbackVerifier, ReplayWindow
  application/
    ports.ts                InsurerAdapter (SPI), AdapterRegistry, CredentialVault, IntegrationCallLog, DeadLetterRepository, BreakerStateStore
    integration-gateway.ts  IntegrationGateway — the facade other modules use (Facade + Proxy around adapters)
    probe.job.ts, dead-letter.service.ts, callback.service.ts, certification.service.ts
  infrastructure/
    adapters/assisted.adapter.ts        always registered
    adapters/fake-insurer.adapter.ts    deterministic sandbox for tests and demos (scriptable latency/failures)
    in-memory-integration.repositories.ts, pg-integration.repositories.ts
  api/ integrations.controller.ts (W12), callbacks.controller.ts (public, verified)
  integration.module.ts
apps/core/migrations/080_integration.sql
apps/web/src/features/integrations/
```

## 3. Domain model

### 3.1 Capability manifest
```ts
export type Operation = 'QUOTE' | 'SUBMIT_PROPOSAL' | 'GET_STATUS' | 'PAYMENT_LINK' | 'POLICY_DOCUMENT' | 'COMMISSION_STATEMENT' | 'RENEWAL_NOTICE';
export type RouteKind = 'API' | 'FILE' | 'ASSISTED';
export interface OperationSpec { operation: Operation; route: RouteKind; mode: 'SYNC' | 'ASYNC'; timeoutMs: number; schemaVersions: string[]; rateLimitPerMinute?: number }
export interface CapabilityManifest {
  adapterId: string; adapterVersion: string;              // semver; pinned per tenant
  counterparty: { kind: 'INSURER' | 'VENDOR'; insurerId?: string; name: string };
  lines: Array<{ line: 'LIFE' | 'HEALTH' | 'GENERAL'; operations: OperationSpec[] }>;
  auth: 'API_KEY' | 'OAUTH2_CLIENT' | 'MTLS' | 'NONE';
  sandboxUrl?: string; slaP95Ms?: number;
}
export class ManifestValidator { validate(m: CapabilityManifest): string[] }   // semver, timeout 1..30000, schema 'v1' supported, no ASSISTED with timeout, unique operation per line+route
```

### 3.2 Route selection
`RouteSelector.select({ manifests, line, operation, tenantPins, breakerStates, certifications })` → `{ route: RouteKind; adapterId; reason }`: candidates for the operation and line from pinned adapters, preferred API → FILE; a candidate whose breaker is OPEN or whose certification for the tenant is not PASSED is skipped (reason recorded); falls back to the assisted adapter (always certified). The decision and reason are logged and returned to callers so screens can show "Insurer API unavailable — assisted route" banners.

### 3.3 Reliability primitives
```ts
export class CircuitBreaker {   // per adapterId+operation
  constructor(policy: { failureRateThreshold: 0.5; minimumCalls: 10; windowSize: 20; slowCallMs: number; openForMs: 30_000; halfOpenProbes: 3 }, clock: Clock)
  canPass(): boolean            // CLOSED → true; OPEN → false until openForMs elapsed then HALF_OPEN; HALF_OPEN → up to halfOpenProbes
  record(outcome: 'success' | 'failure' | 'slow'): void   // sliding window; slow counts as failure
  state(): 'CLOSED' | 'OPEN' | 'HALF_OPEN'
}
export class Bulkhead { constructor(maxConcurrent: number, maxQueue: number); run<T>(fn: () => Promise<T>): Promise<T> }   // queue full → DependencyUnavailableError('bulkhead_full')
export class RetryPolicy { constructor(p: { maxAttempts: 3; baseMs: 200; capMs: 5000 }, random: () => number); delayFor(attempt: number): number; isRetryable(o: CallOutcome): boolean }
// retryable: network errors, 429, 5xx on idempotent operations; never on Unknown for SUBMIT_PROPOSAL — unknown must be resolved by GET_STATUS first
export type CallOutcome<T> = { kind: 'success'; value: T } | { kind: 'failure'; retryable: boolean; code: string; message: string } | { kind: 'unknown'; reason: 'timeout' | 'connection_reset' }
```

### 3.4 Unknown outcomes (HLD §9, LA "unknown state")
`IntegrationGateway.submitProposal` with a timeout returns `{ kind: 'unknown' }`; the gateway immediately schedules `GET_STATUS` with the same business idempotency key (job, backoff) and never resubmits until status says NOT_FOUND. Callers (M09) persist UNKNOWN and surface it ("Submission sent — awaiting insurer confirmation").

### 3.5 Dead letters
After the retry budget for an async operation (or a poison callback), a `DeadLetter { id, adapterId, operation, idempotencyKey, payloadRef, lastError, attempts, ownerTeam, status }` is created; operations can **replay** (same idempotency key) or **discard** with a reason. Payloads are stored encrypted (M03 FieldCipher, tenant key) and purged after 180 days.

### 3.6 Callbacks
`HmacCallbackVerifier.verify({ rawBody, signatureHeader, timestampHeader, secret, now })` — HMAC-SHA256 over `${timestamp}.${rawBody}`, timing-safe compare, timestamp within ±5 minutes; event id dedup via kernel `Inbox`; raw payload retained encrypted for 180 days; stale transitions (older event time than current state time) are rejected and logged.

## 4. Ports
```ts
export interface InsurerAdapter {                 // the SPI — one implementation per counterparty, versioned package
  manifest(): CapabilityManifest
  quote?(ctx: AdapterContext, req: CanonicalQuoteRequest): Promise<CallOutcome<CanonicalQuoteResponse>>
  submitProposal?(ctx: AdapterContext, p: CanonicalProposal): Promise<CallOutcome<SubmissionResult>>
  getStatus?(ctx: AdapterContext, ref: { idempotencyKey: string; insurerRef?: string }): Promise<CallOutcome<PolicyStatusResult>>
  paymentLink?(ctx, req): Promise<CallOutcome<{ url: string; expiresAt: string }>>
  probe(ctx: AdapterContext): Promise<CallOutcome<{ latencyMs: number }>>
}
export interface AdapterContext { tenantId: string; idempotencyKey: string; credentials: () => Promise<Record<string, string>>; signal: AbortSignal; logger: Logger }
export interface CredentialVault { resolve(tenantId: string, adapterId: string): Promise<Record<string, string>> }   // secret refs only; never logged
export interface AdapterRegistry { all(): InsurerAdapter[]; get(adapterId: string): InsurerAdapter | undefined }
export interface IntegrationCallLog { record(tx, entry: { adapterId; operation; idempotencyKey; outcome; latencyMs; at }): Promise<void> }
```
Published facade (token `INTEGRATION_GATEWAY`): `quote`, `submitProposal`, `getStatus`, `paymentLink` — each `(tx, principal|tenantId, input, idempotencyKey)` → `{ route, outcome }`.

## 5. Application services
| Service | Behaviour |
|---|---|
| `IntegrationGateway` | select route → assisted returns `{ route: 'ASSISTED', outcome: { kind: 'unknown', reason: 'assisted' } }` with instructions; API/FILE: bulkhead → breaker → timeout (AbortController) → retry policy → call log (latency, outcome, no payloads) → metrics; traced spans `integration.<adapter>.<operation>` |
| `ProbeJob` | every 5 min per pinned adapter: `probe()` → breaker record + health board row `{ adapterId, lastOkAt, p95Ms, state }` |
| `DeadLetterService` | list/inspect (payload decrypted only for `integration.write`), replay, discard (audit); tenant-scoped, handled by the tenant's own TENANT_ADMIN/OPS |
| `CallbackService` | verify → inbox → map to canonical event `integration.callback.received` `{ adapterId, kind, idempotencyKey }` for M09/M07 |
| `CertificationService` | per tenant per adapter: checklist runs against `FakeInsurerAdapter`-style sandbox (happy path, decline, timeout, duplicate callback, schema drift) → PASSED/FAILED; only PASSED adapters are routable for that tenant |

## 6. API
| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/integrations` | `integration.read` (TENANT_ADMIN, OPS) — adapters available, pinned version, certification, breaker state, last probe |
| PUT | `/api/v1/integrations/{adapterId}/pin` | `integration.write` — `{ version }` |
| POST ✱ | `/api/v1/integrations/{adapterId}/certifications` | `integration.write` — runs the checklist |
| GET | `/api/v1/integrations/dead-letters?status=` · GET `/api/v1/integrations/dead-letters/{id}` | `integration.read` (TENANT_ADMIN, OPS); payload decrypted only with `integration.write` |
| POST ✱ | `/api/v1/integrations/dead-letters/{id}/replay` · POST ✱ `/api/v1/integrations/dead-letters/{id}/discard` | `integration.write` (TENANT_ADMIN, OPS) |
| POST | `/api/v1/callbacks/{adapterId}` | public, HMAC-verified; 401 on bad signature (security log), 409 on stale |

## 7. DDL — `080_integration.sql`
`integration_pin` (tenant, adapter, version), `integration_certification`, `integration_call_log` (no payloads; 90-day retention; partitioning deferred, see §11.7), `integration_breaker_state` (platform scope), `dead_letter` (payload_enc), `callback_raw` (payload_enc, received_at; purge job 180 days); RLS on tenant tables.

## 8. Observability
Metrics `integration_calls_total{adapter,operation,route,outcome}`, `integration_call_duration_ms{adapter,operation}` (histogram), `integration_breaker_state{adapter,operation}` (gauge 0/1/2), `integration_dead_letters_open` (gauge, business monitor); logs carry adapterId, operation, idempotencyKey, latency — never request/response bodies or credentials; security logs `security.callback_rejected`.

## 9. Frontend — W12 `IntegrationsScreen`
Adapter cards (insurer, version pin, certification badge, breaker state chip, last probe + p95), "Run certification" with checklist results, dead-letter table (TENANT_ADMIN, OPS of the tenant) with inspect/replay/discard and reason.

## 10. Acceptance criteria
- **AC-M08-01** Manifest validation rules; route selection prefers API, then FILE, skips open breakers and uncertified adapters with reasons, and always falls back to ASSISTED.
- **AC-M08-02** Circuit breaker opens at the failure-rate threshold after minimum calls, counts slow calls, half-opens after the open period and closes after successful probes.
- **AC-M08-03** Bulkhead caps concurrency per counterparty and rejects when the queue is full.
- **AC-M08-04** Retry: exponential backoff with full jitter (deterministic with injected random), retries only retryable outcomes, reuses the same idempotency key.
- **AC-M08-05** Timeout on submit → unknown outcome → status query scheduled; no resubmission until status is NOT_FOUND.
- **AC-M08-06** Dead letter after three strikes; replay uses the same idempotency key; discard needs a reason; payloads encrypted and purged at 180 days.
- **AC-M08-07** Callbacks: bad signature 401 + security log, timestamp outside ±5 min rejected, duplicate event processed once, stale transition rejected.
- **AC-M08-08** Probe job updates health and breaker; certification gates routing per tenant.
- **AC-M08-09** Call logs and logs never contain payloads or credentials (asserted with a canary value).
- **AC-M08-10** Postgres: migration, RLS, 90-day call-log retention. *(integration)*
- **AC-M08-11** Integrations screen: cards, certification run, dead-letter operations.

## 11. Proposed contract clarifications (draft, 2026-10-04)

### 11.1 Outcome and manifest corrections

Keep the existing `CallOutcome<T>` discriminants. Extend unknown reasons to `'timeout' | 'connection_reset' | 'assisted'`. An assisted result means no automated send occurred; it includes instructions through the gateway result and does not enqueue GET_STATUS. M09 must distinguish this from an uncertain external send before applying its UNKNOWN transition.

Replace `OperationSpec` with:

```ts
export type OperationSpec = {
  operation: Operation;
  schemaVersions: string[];
  rateLimitPerMinute?: number;
} & (
  | { route: 'API' | 'FILE'; mode: 'SYNC' | 'ASYNC'; timeoutMs: number }
  | { route: 'ASSISTED'; mode: 'ASYNC'; timeoutMs?: never }
);
```

API/FILE timeouts are integers 1..30000; ASSISTED has no timeout and uses auth NONE. Every operation supports v1; adapterVersion is semver; line+operation+route is unique; rate limits, when present, are positive integers. The registered method must exist for a advertised callable capability. Invalid manifests fail registration. POLICY_DOCUMENT, COMMISSION_STATEMENT and RENEWAL_NOTICE remain vocabulary for future SPI extensions; M08 exposes only the four existing facade operations and probe. Advertising those future capabilities as API/FILE is rejected until their methods are specified.

Route selection additionally filters by input insurerId for insurer calls, exact pinned version and certification for that version. Stable ties sort by adapterId. `reason` is one of `api_available`, `file_available`, `assisted_fallback`; `skipped` entries carry `{ adapterId, reason: 'not_pinned' | 'version_mismatch' | 'uncertified' | 'breaker_open' | 'capability_missing' | 'counterparty_mismatch' }`. Assisted uses adapterId `assisted`, version `1.0.0`, needs no pin or credentials, and supports all three lines for the four facade operations. A pending unknown send remains bound to its original adapter/version, regardless of later pin changes.

### 11.2 Canonical v1 models (`domain/canonical.ts`)

Dates with time are ISO UTC; business dates are YYYY-MM-DD; money is safe integer paise. No tenant field is accepted in canonical inputs. Values containing personal data are transient or encrypted, never logged.

```ts
export type InsuranceLine = 'LIFE' | 'HEALTH' | 'GENERAL';
export interface CanonicalTarget {
  schemaVersion: 'v1'; insurerId: string; line: InsuranceLine;
}
export interface CanonicalQuoteRequest extends CanonicalTarget {
  quoteRequestId: string; productVersionId: string;
  requirements: Record<string, unknown>;
}
export interface CanonicalQuoteResponse {
  schemaVersion: 'v1'; insurerQuoteRef: string;
  premium: { amountPaise: number; currency: 'INR' };
  validUntil: string; benefitIllustrationRef?: string;
}
export interface CanonicalProposal extends CanonicalTarget {
  proposalId: string; productVersionId: string; quoteOptionId: string;
  templateVersion: string; snapshotHash: string;
  answers: Record<string, unknown>;
  parties: Array<{ partyId: string; role: 'PROPOSER' | 'LIFE_ASSURED' | 'INSURED' | 'PAYER' | 'NOMINEE' }>;
  declarations: Array<{ key: string; version: string; acceptedAt: string }>;
  documents: Array<{ kind: string; documentRef: string }>;
  confirmedAt: string;
}
export interface SubmissionResult {
  schemaVersion: 'v1'; insurerRef: string; acknowledgedAt: string;
}
export type PolicyStatusResult =
  | { schemaVersion: 'v1'; status: 'NOT_FOUND'; checkedAt: string }
  | { schemaVersion: 'v1'; status: 'RECEIVED' | 'UNDERWRITING' | 'REQUIREMENTS_PENDING' | 'DECLINED'; insurerRef: string; checkedAt: string }
  | { schemaVersion: 'v1'; status: 'ISSUED'; insurerRef: string; checkedAt: string;
      policyNumber: string; issuedOn: string; documentRef: string;
      premium: { amountPaise: number; currency: 'INR' }; sumAssuredPaise?: number };
export interface StatusRequest extends CanonicalTarget {
  insurerRef?: string;
}
export interface PaymentLinkRequest extends CanonicalTarget {
  proposalId: string; insurerRef: string;
  amount: { amountPaise: number; currency: 'INR' };
}
export interface PaymentLinkResult {
  url: string; expiresAt: string;
}
export interface CommissionStatement {
  schemaVersion: 'v1'; insurerId: string; statementRef: string;
  periodFrom: string; periodTo: string;
  entries: Array<{ insurerRef: string; receivedOn: string; amountPaise: number }>;
}
```

`Record<string, unknown>` permits template-specific answers/requirements, not arbitrary unchecked transport JSON: adapter-specific schemas validate them at the boundary. CanonicalProposal contains already confirmed facts; M08 does not prefill or manufacture declarations. CommissionStatement is reserved data vocabulary, with no M08 fetch/import behavior. Signed document/payment URLs must be HTTPS and on a configured insurer allowlist; credentials and bank/card data are prohibited. M09 owns full issuance validation and PolicySale creation; a status is not itself a sale.

### 11.3 Facade and repository contracts (`application/ports.ts`)

Use existing kernel `Transaction`, `Principal`, `Logger`, `Clock`, `IdGenerator`, `FieldCipher`, plus an injected `RandomSource` (`next(): number` in [0, 1), token `RANDOM_SOURCE`) for retry jitter so AC-M08-04 is deterministic. Gateway facade methods take no caller transaction: the gateway opens its own unit(s) of work for `principal.tenantId`, and callers (M09) must commit their own state before calling and must not call from inside an open transaction. Repository methods stay `(tx, ...)` inside the gateway's units of work. Jobs construct a trusted principal from persisted work, never HTTP input. Remove the ambiguous `principal|tenantId` overload.

```ts
export interface GatewayResult<T> {
  route: RouteKind; adapterId: string; adapterVersion: string;
  reason: 'api_available' | 'file_available' | 'assisted_fallback';
  outcome: CallOutcome<T>;
  instructions?: { kind: 'INSURER_PORTAL'; evidenceRequired: true };
  reconciliationId?: string;
}
export interface IntegrationGatewayPort {
  quote(principal: Principal, input: CanonicalQuoteRequest, idempotencyKey: string): Promise<GatewayResult<CanonicalQuoteResponse>>;
  submitProposal(principal: Principal, input: CanonicalProposal, idempotencyKey: string): Promise<GatewayResult<SubmissionResult>>;
  getStatus(principal: Principal, input: StatusRequest, idempotencyKey: string): Promise<GatewayResult<PolicyStatusResult>>;
  paymentLink(principal: Principal, input: PaymentLinkRequest, idempotencyKey: string): Promise<GatewayResult<PaymentLinkResult>>;
}
export interface IntegrationCallEntry {
  id: string; adapterId: string; adapterVersion: string; operation: Operation;
  route: RouteKind; idempotencyKey: string;
  outcome: 'success' | 'failure' | 'unknown'; errorCode?: string;
  latencyMs: number; at: string;
}
export interface IntegrationCallLog {
  record(tx: Transaction, entry: IntegrationCallEntry): Promise<void>;
  purgeBefore(tx: Transaction, before: string): Promise<number>;
}
export interface AdapterPin { adapterId: string; version: string; updatedAt: string }
export interface PinRepository {
  list(tx: Transaction): Promise<AdapterPin[]>;
  put(tx: Transaction, pin: AdapterPin): Promise<void>;
}
export type ChecklistKind = 'HAPPY_PATH' | 'DECLINE' | 'TIMEOUT' | 'DUPLICATE_CALLBACK' | 'SCHEMA_DRIFT';
export interface Certification {
  adapterId: string; adapterVersion: string; status: 'PASSED' | 'FAILED';
  checkedAt: string; checks: Array<{ kind: ChecklistKind; passed: boolean; code?: string }>;
}
export interface CertificationRepository {
  get(tx: Transaction, adapterId: string, version: string): Promise<Certification | undefined>;
  save(tx: Transaction, certification: Certification): Promise<void>;
}
export interface DeadLetter {
  id: string; adapterId: string; adapterVersion: string; operation: Operation;
  idempotencyKey: string; payloadRef: string; lastError: string; attempts: number;
  ownerTeam: 'INTEGRATION_OPS'; status: 'OPEN' | 'REPLAYED' | 'DISCARDED';
  createdAt: string; payloadExpiresAt: string; discardReason?: string;
}
export interface DeadLetterRepository {
  get(tx: Transaction, id: string): Promise<DeadLetter | undefined>;
  save(tx: Transaction, entry: DeadLetter): Promise<void>;
  list(tx: Transaction, query: { status?: DeadLetter['status']; cursor?: string; limit: number }): Promise<{ items: DeadLetter[]; nextCursor?: string }>;
}
export interface EncryptedPayloadRepository {
  put(tx: Transaction, value: { id: string; payloadEnc: string; expiresAt: string }): Promise<void>;
  get(tx: Transaction, id: string): Promise<{ payloadEnc: string; expiresAt: string } | undefined>;
  purgeBefore(tx: Transaction, before: string): Promise<number>;
}
export interface BreakerSnapshot {
  adapterId: string; adapterVersion: string; operation: Operation;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'; openedAt?: string;
  samples: Array<'success' | 'failure' | 'slow'>; halfOpenInFlight: number;
  halfOpenSuccesses: number; version: number;
}
export interface BreakerStateStore {   // display snapshot for the health board; the breaker itself is in-process
  get(adapterId: string, adapterVersion: string, operation: Operation): Promise<BreakerSnapshot | undefined>;
  save(value: BreakerSnapshot): Promise<void>;   // last write wins
}
```

Extend registry lookup to `get(adapterId: string, version?: string)`; when omitted, return only if exactly one version is registered. Define `paymentLink?(ctx: AdapterContext, req: PaymentLinkRequest): Promise<CallOutcome<PaymentLinkResult>>`. Other SPI methods retain §4 signatures. PinRepository owns M08 pins; M01 supplies tenant directory and secret references, without M08 importing M01 repositories. Publish symbol tokens with these exact interface names, plus `INTEGRATION_GATEWAY = Symbol('IntegrationGateway')`.

Retries count the initial call as attempt 1. Before attempt n+1, delay is `floor(random.next() * min(5000, 200 * 2 ** (n - 1)))`; max three total attempts. Unknown never retries; submit network resets are unknown when send completion is uncertain. Non-retryable failures stop immediately. A timeout race settles the facade even if an adapter ignores abort; its bulkhead slot stays occupied until the actual promise settles. A late result cannot overwrite the durable unknown barrier. Bulkhead limits apply across operations/versions of one counterparty per process; multi-process global concurrency is not claimed. Breaker state is held per process; one admission reserves one half-open probe, any failed/slow probe reopens, three successful probes close. The persisted snapshot is informational (last write wins); a shared cross-process breaker is future scope. Probe deadlines use 30000ms.

### 11.4 Durable unknown-submission barrier and jobs

Add `application/reconciliation.job.ts` and `retention.job.ts`. The gateway persists a submission intent in its own short committed unit of work before starting external IO, and records the outcome in a second unit of work afterwards. It never holds a database transaction across external calls, retries or sleeps. M09 must commit its frozen snapshot and SubmissionAttempt before calling `submitProposal`, then apply the returned result in a new transaction of its own; this requires the M09 LLD update described in the ADR.

```ts
// One row per tenant+idempotencyKey in integration_submission: both the resend barrier and the reconciliation work item.
export interface SubmissionRecord {
  id: string; adapterId: string; adapterVersion: string;   // bound at reserve; never re-routed
  idempotencyKey: string; inputHash: string;
  proposalEnc?: string;                     // FieldCipher-encrypted CanonicalProposal; purged at payload expiry
  statusRequest: StatusRequest;             // non-personal target used for GET_STATUS reconciliation
  state: 'SENDING' | 'PENDING' | 'COMPLETED' | 'DEAD_LETTER';
  // SENDING: intent committed, external send in flight (60-second lease)
  // PENDING: send outcome uncertain; GET_STATUS due at nextAttemptAt
  // COMPLETED: insurer answered (direct submit success/failure, or authoritative status from reconciliation)
  // DEAD_LETTER: three failed status queries; barrier kept until resolved
  attempts: number; nextAttemptAt?: string; leaseUntil?: string; lastError?: string;
  outcome?: 'success' | 'failure';          // set when COMPLETED
  resultEnc?: string;                       // encrypted SubmissionResult or PolicyStatusResult
  resultExpiresAt?: string;                 // COMPLETED + 30 days: replay window for the same key
  createdAt: string; updatedAt: string;
}
export interface SubmissionRepository {
  reserve(tx: Transaction, record: SubmissionRecord): Promise<{ created: boolean; record: SubmissionRecord }>;   // unique tenant+idempotencyKey
  getByKey(tx: Transaction, idempotencyKey: string): Promise<SubmissionRecord | undefined>;
  claimDue(tx: Transaction, now: string, leaseUntil: string, limit: number): Promise<SubmissionRecord[]>;   // PENDING due, or SENDING with an expired lease
  save(tx: Transaction, record: SubmissionRecord): Promise<void>;
}
```

Unique tenant+business key; same key with a different canonical input hash → 409 `idempotency_key_reuse`. A duplicate SENDING/PENDING or unresolved DEAD_LETTER returns unknown with `reconciliationId` (= SubmissionRecord.id) and never calls submit again. A duplicate COMPLETED record replays its decrypted result until `resultExpiresAt`; after that the key still blocks a resend and returns the stored outcome without the result body. Unresolved barriers are retained until resolved, even beyond 30 days. Reserve stores `proposalEnc`, `inputHash` and the bound adapter/version. SENDING has a 60-second lease; after process failure/lease expiry it becomes PENDING GET_STATUS work, never a resend. Assisted does not reserve a SENDING intent.

Timeout/reset atomically records PENDING and nextAttemptAt=now; ReconciliationJob claims due SubmissionRecords with a 60-second lease, batch limit 100, through trusted tenant enumeration and tenant UoWs. Query only the original adapter/version with the original key. Any authoritative status resolves work, emits `integration.submission.reconciled` with `{ reconciliationId, adapterId, adapterVersion, idempotencyKey, status }`, and retains the encrypted full result for authorized reads. The event has no policy number or answers. RECEIVED/UNDERWRITING/REQUIREMENTS_PENDING/DECLINED/ISSUED prove receipt; NOT_FOUND permits M09 to reject that attempt and begin a NEW attempt, consistent with M09 §3.3. M08 never automatically resubmits.

Three failed/unknown status queries create one GET_STATUS dead letter and retain the barrier. Replay queries status, not submit. Retryable exhausted async calls create one dead letter; non-retryable permanent failures create one immediately with actual attempt count. Poison callbacks create one after three processing failures. Replay uses the original adapter/version/key, requires current certification, and cannot route to a replacement adapter. Purged payload → 410 `integration_payload_expired`; replay of a terminal dead letter → 409 `dead_letter_closed`; blank discard reason → 400 `discard_reason_required`. Discard changes operations status only; it cannot clear an unknown-submission barrier.

Jobs expose `runOnce(): Promise<void>`, invocable per run like the M07 jobs; durable leases prevent duplicate reconciliation across processes. Intended cadence: probe every five minutes, reconciliation every minute, retention daily. Wiring a deployment scheduler or in-process timers is future scope. Missing historical adapter versions raise `adapter_version_unavailable` and remain unresolved.

### 11.5 Callback envelope, trust and atomicity

Public callbacks derive tenant from the verified Host tenant directory. The route adapterId and that tenant select the callback secret reference; neither body nor query can choose tenant. Adapter version is resolved from the stored submission binding, not the current pin. Unknown/missing tenant or unavailable callback credentials fail closed. Launch verification is HMAC; mTLS is an edge-level future binding, not an unimplemented bypass.

Headers: `x-callback-timestamp` = Unix seconds as decimal string; `x-callback-signature` = 64 lowercase hexadecimal characters. Sign exact raw UTF-8 bytes as `${timestamp}.${rawBody}`; reject malformed headers, unequal signature length, and absolute time skew >300 seconds with 401 `callback_signature_invalid` and `security.callback_rejected`, without raw body/header/secret logging.

```ts
export interface CanonicalCallback {
  schemaVersion: 'v1'; eventId: string; occurredAt: string;
  kind: 'POLICY_STATUS'; idempotencyKey: string; status: PolicyStatusResult;
}
export interface CallbackRepository {
  accept(tx: Transaction, input: { adapterId: string; adapterVersion: string;
    eventId: string; idempotencyKey: string; occurredAt: string;
    rawBodyHash: string;                    // SHA-256 hex of the exact raw bytes; same eventId with a different hash -> CONFLICT
    rawPayloadEnc: string; receivedAt: string; expiresAt: string }): Promise<'ACCEPTED' | 'DUPLICATE' | 'STALE' | 'CONFLICT'>;
}
```

Strict schema and max raw body 1MiB (413 `callback_too_large`); malformed verified JSON/schema → 400 `callback_schema_invalid`; unknown submission binding → 404 `integration_submission_not_found`. Event time cannot be later than receivedAt+5min. Cursor scope is tenant+adapter+business key. Older time, or equal time with conflicting status, → 409 `callback_stale`. Duplicate eventId returns 200 `{ status: 'duplicate' }`; accepted callback returns 200 `{ status: 'accepted' }`. Same eventId with a different body hash → 409 `callback_event_conflict`.

Durable dedup key, cursor update, encrypted raw payload and outbox event commit atomically in the RLS transaction; lock the cursor before comparing. Kernel Inbox alone is insufficient: its published API has no caller tx, so a crash between handler commit and inbox marking can repeat effects. Reuse its consumer/event naming semantics, but make CallbackRepository's tenant-scoped unique constraint the authoritative transaction boundary; no kernel API change proposed. Emit `integration.callback.received` `{ callbackId, adapterId, adapterVersion, kind, idempotencyKey }`; consumers fetch canonical content by callbackId through a scoped internal reader, rather than receiving P3 data in outbox logs. M09 still rejects illegal business transitions even when callback time is newer.

### 11.6 HTTP and operations contracts

Dead letters are tenant data and are handled by the tenant itself: routes live under `/api/v1/integrations/dead-letters` (§6), tenant comes from the verified Host like every tenant route, and TENANT_ADMIN and tenant OPS receive `integration.read`/`integration.write`. Platform operators have no dead-letter route and never see payloads; they monitor the per-tenant `integration_dead_letters_open` gauge and help on request. No cross-tenant list/inspection is introduced. Platform-operator tenant access is future scope (docs/hld/FUTURE-SCOPE.md). Mutating POST operations except signed callbacks require Idempotency-Key under §04.

| Endpoint | Success status/body | Additional errors |
|---|---|---|
| GET integrations | 200 `{ items: AdapterHealth[] }` | standard 401/403 |
| PUT pin | 200 `{ adapterId, version, updatedAt }` | 404 `adapter_not_found`; 422 `adapter_version_unavailable` |
| POST certifications | 200 `Certification` (FAILED is a result, not HTTP failure) | 404 `adapter_not_found` |
| GET dead-letters | 200 `{ items: DeadLetter[], nextCursor? }` | 400 invalid status/limit/cursor |
| GET dead-letter detail | 200 `{ entry: DeadLetter, payload?: unknown, payloadExpired: boolean }` | 404 `dead_letter_not_found` |
| POST replay | 202 `{ id, status: 'REPLAYED' }`, Location points to detail | 409 `dead_letter_closed`; 410 `integration_payload_expired`; 422 `adapter_not_certified` |
| POST discard | 200 `{ id, status: 'DISCARDED' }`; body `{ reason: string }` trimmed 1..500 chars | 400 `discard_reason_required`; 409 `dead_letter_closed` |

`AdapterHealth` = `{ adapterId, adapterVersion, counterparty, pin?: AdapterPin, certification?: Certification, breakers: Array<{ operation, state }>, lastProbe?: { at, outcome, latencyMs, lastOkAt?, p95Ms? } }`. p95 uses the last 20 completed probes (sorted nearest-rank); unset before any probe. Dead-letter list sorts createdAt descending then id, default limit 25/max100; never includes decrypted payload. Detail decrypts only for `integration.write` and emits an access audit. Replay atomically schedules durable work and marks REPLAYED; worker failure creates a linked new OPEN entry, without mutating the terminal source. Health and certification diagnostics contain only safe codes, no payload fragments. All actions audit actor, target, action and safe reason codes.

Certification runs the §5 checklist against the adapter's sandbox double, never production calls or production breaker samples. Persist results for exact tenant+adapter+version; all five checks must pass. A separate per-tenant sandbox credential binding is future scope. The assisted adapter supplies instructions; M09 owns operator evidence capture, with no invented M08 portal-record endpoint.

### 11.7 Persistence and additional acceptance evidence

080 adds §7 tables plus `integration_submission` (SubmissionRecord), `integration_payload`, `integration_callback_cursor`, and `integration_health`. All except platform breaker state are tenant scoped with forced RLS using existing kernel conventions. Credentials are secret references only. Unique pin/certification keys include tenant and version as appropriate; callback dedup includes tenant+adapter+eventId; submission business key is tenant+idempotencyKey. State, attempt, expiry and lease fields enforce the unions above. JSONB canonical payloads/results are encrypted strings at rest; no plaintext answers, policy numbers, URLs or external error messages in call logs.

Call log is a plain tenant-scoped table indexed on (tenant_id, at); RetentionJob deletes rows at exact 90-day age. Monthly partitioning is future scope (revisit at call-log volume targets). Payload retention uses elapsed UTC time of 180 days, independently of IST business dates. Purge ciphertext/raw bodies at expiry, retaining minimal dedup hashes and unresolved safety barriers; resolved submission responses expire at 30 days. RetentionJob cleans payloads even for OPEN dead letters. Raw callback storage includes the raw-body hash needed to detect changed duplicates. Background tenant enumeration does not bypass RLS for tenant reads/writes; only platform breaker snapshot storage uses the owner pool.

Extend existing AC evidence, retaining IDs:

- AC-M08-01: type/validation cases for assisted timeout omission, future capabilities and version/counterparty selection.
- AC-M08-04/05: crash immediately before/after send, repeated caller key, lease recovery, pin changes during unknown, late response, NOT_FOUND new-attempt behavior, and no submit during DLQ replay/discard.
- AC-M08-06/10: concurrent replay claims; expiry boundaries; actual app-role RLS; restart preserves dedup, barriers, jobs and encrypted content; exact 90-day call-log pruning.
- AC-M08-07: cross-tenant signature/binding rejection, changed duplicate body (rawBodyHash -> 409 `callback_event_conflict`), concurrent stale cursor updates, handler rollback and crash/redelivery.
- AC-M08-08/09: probe p95 and canary scans of logs, call-log rows and outbox payloads.
- AC-M08-11: version pin and certification results, detail access, discard reason, pending replay, expired payload, permissions, loading/empty/error states and English/Hindi keys.
