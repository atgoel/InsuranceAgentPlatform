# M08 · Integration Hub — low-level design

Status: Approved contract — decisions 1–13 approved by the user on 2026-10-04; runtime implemented; final verification recorded in docs/quality/M08-handback.md · Depends on: M00 (kernel), M01 (tenant directory for per-tenant adapter pins and credentials refs) · Requirements: Rev 3.0 F18 (API quote/submission/issuance; assisted route always available), F57–F59 (gated vendors on the same SPI) · HLD D6, §9 "Adapter SPI" and "Reliability contract for every external call", §12 failure table (insurer API down → assisted with banner), §16 business monitors (dead-letter depth) · Screens: W12 `Integrations` (adapter health board, DLQ operations)

## 1. Responsibilities

The only component that talks to insurers and vendors. Domain modules (M06 quotes, M09 proposals, M10 statements, M07 status sync) call **capabilities** on a canonical model — never a named insurer:

- **Adapter SPI** with a **capability manifest** per adapter and line; runtime **route selection** (API → file → assisted).
- **Reliability contract**: business idempotency keys reused on every retry; timeouts become **unknown outcomes** that trigger a status query before any resubmission; per-counterparty **bulkhead** and **circuit breaker**; exponential backoff with jitter; **dead-letter queue** after three strikes with an operations screen and replay.
- **Inbound callbacks**: HMAC verification, replay window, atomic repository deduplication (mTLS deferred), raw payload retention (180 days), stale-transition rejection.
- **Assisted adapter**: an operator records a portal transaction with evidence — always available, so selling never depends on an API.
- **Health**: invocable synthetic probes (intended cadence every 5 minutes) feeding the breaker and the health board.

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
    probe.job.ts, reconciliation.job.ts, retention.job.ts,
    dead-letter.service.ts, callback.service.ts, certification.service.ts
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
export type OperationSpec = {
  operation: Operation;
  schemaVersions: string[];
  rateLimitPerMinute?: number;
} & (
  | { route: 'API' | 'FILE'; mode: 'SYNC' | 'ASYNC'; timeoutMs: number }
  | { route: 'ASSISTED'; mode: 'ASYNC'; timeoutMs?: never }
);
export interface CapabilityManifest {
  adapterId: string; adapterVersion: string;              // semver; pinned per tenant
  counterparty: { kind: 'INSURER' | 'VENDOR'; insurerId?: string; name: string };
  lines: Array<{ line: 'LIFE' | 'HEALTH' | 'GENERAL'; operations: OperationSpec[] }>;
  auth: 'API_KEY' | 'OAUTH2_CLIENT' | 'MTLS' | 'NONE';
  sandboxUrl?: string; slaP95Ms?: number;
}
export class ManifestValidator { validate(m: CapabilityManifest): string[] }
```

API/FILE timeouts are integers 1..30000; ASSISTED has no timeout and uses auth NONE. Every operation supports v1; adapterVersion is semver; line+operation+route is unique; rate limits, when present, are positive integers. The registered method must exist for a advertised callable capability. Invalid manifests fail registration. POLICY_DOCUMENT, COMMISSION_STATEMENT and RENEWAL_NOTICE remain vocabulary for future SPI extensions; M08 exposes only the four existing facade operations and probe. Advertising those future capabilities as API/FILE is rejected until their methods are specified.

### 3.2 Route selection

`RouteSelector.select({ manifests, line, insurerId, operation, tenantPins, breakerStates, certifications })` returns route, adapterId, adapterVersion, reason and skipped entries. API is preferred over FILE; ASSISTED is the fallback.

Route selection additionally filters by input insurerId for insurer calls, exact pinned version and certification for that version. Stable ties sort by adapterId. `reason` is one of `api_available`, `file_available`, `assisted_fallback`; `skipped` entries carry `{ adapterId, reason: 'not_pinned' | 'version_mismatch' | 'uncertified' | 'breaker_open' | 'capability_missing' | 'counterparty_mismatch' }`. Assisted uses adapterId `assisted`, version `1.0.0`, needs no pin or credentials, and supports all three lines for the four facade operations. A pending unknown send remains bound to its original adapter/version, regardless of later pin changes.

### 3.3 Reliability primitives

```ts
export class CircuitBreaker {   // per adapterId+adapterVersion+operation, per process
  constructor(policy: { failureRateThreshold: 0.5; minimumCalls: 10; windowSize: 20; slowCallMs: number; openForMs: 30_000; halfOpenProbes: 3 }, clock: Clock)
  canPass(): boolean            // CLOSED → true; OPEN → false until openForMs elapsed then HALF_OPEN; HALF_OPEN → up to halfOpenProbes
  record(outcome: 'success' | 'failure' | 'slow'): void   // sliding window; slow counts as failure
  state(): 'CLOSED' | 'OPEN' | 'HALF_OPEN'
}
export class Bulkhead { constructor(maxConcurrent: number, maxQueue: number); run<T>(fn: () => Promise<T>): Promise<T> }   // queue full → DependencyUnavailableError('bulkhead_full')
export class RetryPolicy { constructor(p: { maxAttempts: 3; baseMs: 200; capMs: 5000 }, random: () => number); delayFor(attempt: number): number; isRetryable(o: CallOutcome): boolean }
// retryable: network errors, 429, 5xx on idempotent operations; never on Unknown for SUBMIT_PROPOSAL — unknown must be resolved by GET_STATUS first
export type CallOutcome<T> = { kind: 'success'; value: T } | { kind: 'failure'; retryable: boolean; code: string; message: string } | { kind: 'unknown'; reason: 'timeout' | 'connection_reset' | 'assisted' }
```

Retries count the initial call as attempt 1. Before attempt n+1, delay is `floor(random.next() * min(5000, 200 * 2 ** (n - 1)))`; max three total attempts. Unknown never retries; submit network resets are unknown when send completion is uncertain. Non-retryable failures stop immediately. A timeout race settles the facade even if an adapter ignores abort; its bulkhead slot stays occupied until the actual promise settles. A late result cannot overwrite the durable unknown barrier. Bulkhead limits apply across operations/versions of one counterparty per process; multi-process global concurrency is not claimed. Breaker state is held per process; one admission reserves one half-open probe, any failed/slow probe reopens, three successful probes close. The persisted snapshot is informational (last write wins); a shared cross-process breaker is future scope. Probe deadlines use 30000ms.

### 3.4 Unknown outcomes and completed replay

Add `application/reconciliation.job.ts` and `retention.job.ts`. The gateway persists a submission intent in its own short committed unit of work before starting external IO, and records the outcome in a second unit of work afterwards. It never holds a database transaction across external calls, retries or sleeps. M09 must commit its frozen snapshot and SubmissionAttempt before calling `submitProposal`, then apply the returned result in a new transaction of its own; M09 §3.3 and §5 publish this consumption contract.

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
  resultEnc?: string;                       // encrypted discriminated terminal result
  resultKind?: 'DIRECT' | 'RECONCILED';     // resultEnc is kept for the life of the record (no separate expiry)
  createdAt: string; updatedAt: string;
}
export interface SubmissionRepository {
  reserve(tx: Transaction, record: SubmissionRecord): Promise<{ created: boolean; record: SubmissionRecord }>;   // unique tenant+idempotencyKey
  getByKey(tx: Transaction, idempotencyKey: string): Promise<SubmissionRecord | undefined>;
  claimDue(tx: Transaction, now: string, leaseUntil: string, limit: number): Promise<SubmissionRecord[]>;   // PENDING due, or SENDING with an expired lease
  save(
    tx: Transaction,
    record: SubmissionRecord,
    expected: { state: SubmissionRecord['state']; leaseUntil?: string },
  ): Promise<boolean>;
  purgeProposalBefore(tx: Transaction, before: string): Promise<number>;
}
```

Unique tenant+business key; same key with a different canonical input hash → 409 `idempotency_key_reuse`. A duplicate SENDING/PENDING or unresolved DEAD_LETTER returns unknown with `reconciliationId` (= SubmissionRecord.id) and never calls submit again. A duplicate COMPLETED record replays DIRECT or RECONCILED according to resultKind. `proposalEnc` is purged at 180 days; the record, its classification and `resultEnc` are kept, so a completed key always blocks a resend and always replays its result. Unresolved barriers are retained until resolved. Reserve stores `proposalEnc`, `inputHash` and the bound adapter/version. SENDING has a 60-second lease; after process failure/lease expiry it becomes PENDING GET_STATUS work, never a resend. Assisted does not reserve a SENDING intent.

save matches persisted state and lease against expected atomically. False means
stale ownership: discard that worker's result and publish no reconciliation event.
Direct send completion compares its original SENDING lease; recovered PENDING
work cannot be overwritten by a late response. Result and outbox commit together
in one short unit of work; external IO holds no database lock. The memory adapter
performs comparison and update synchronously, with the same return semantics.

Timeout/reset atomically records PENDING and nextAttemptAt=now; ReconciliationJob claims due SubmissionRecords with a 60-second lease, batch limit 100, through trusted tenant enumeration and tenant UoWs. Query only the original adapter/version with the original key. Any authoritative status resolves work, emits `integration.submission.reconciled` with `{ reconciliationId, adapterId, adapterVersion, idempotencyKey, status }`, and retains the encrypted full result for authorized reads. The event has no policy number or answers. RECEIVED/UNDERWRITING/REQUIREMENTS_PENDING/DECLINED/ISSUED prove receipt; NOT_FOUND permits M09 to reject that attempt and begin a NEW attempt, consistent with M09 §3.3. M08 never automatically resubmits.

Three failed/unknown status queries create one GET_STATUS dead letter and retain the barrier. Replay queries status, not submit. Retryable exhausted async calls create one dead letter; non-retryable permanent failures create one immediately with actual attempt count. Downstream callback consumers are delivered through the kernel outbox, which retries and dead-letters after three attempts (§5.2). Replay uses the original adapter/version/key, requires current certification, and cannot route to a replacement adapter. Purged payload → 410 `integration_payload_expired`; replay of a terminal dead letter → 409 `dead_letter_closed`; blank discard reason → 400 `discard_reason_required`. Discard changes operations status only; it cannot clear an unknown-submission barrier.



Store the full encrypted terminal CallOutcome<SubmissionResult> for direct
responses, including failure classification and safe code. Store reconciliation
results with an explicit DIRECT/RECONCILED discriminator. Results do not expire
separately from their record, so no expired-result variant exists. Purging whole
submission records is future scope. This facade contract does not change the adapter SPI.

### 3.5 Dead letters

OPEN → REPLAYED | DISCARDED. Both destination states are terminal. Replay/discard never removes an unresolved submission barrier. Payloads are encrypted and retained for 180 days. Replay is synchronous (§5.1).

### 3.6 Callbacks

`HmacCallbackVerifier.verify({ rawBody, signatureHeader, timestampHeader, secret, now })`
verifies HMAC-SHA256 over the exact timestamp and raw body bytes using timing-safe
comparison and the replay window below. Verification has no persistence effects.

Public callbacks derive tenant from the verified Host tenant directory. The route adapterId and that tenant select the callback secret reference; neither body nor query can choose tenant. Adapter version is resolved from the stored submission binding, not the current pin. Unknown/missing tenant or unavailable callback credentials fail closed. Launch verification is HMAC; mTLS is an edge-level future binding, not an unimplemented bypass.

Headers: `x-callback-timestamp` = Unix seconds as decimal string; `x-callback-signature` = 64 lowercase hexadecimal characters. Sign exact raw UTF-8 bytes as `${timestamp}.${rawBody}`; reject malformed headers, unequal signature length, and absolute time skew >300 seconds with 401 `callback_signature_invalid` and `security.callback_rejected`, without raw body/header/secret logging.

```ts
export interface CanonicalCallback {
  schemaVersion: 'v1'; eventId: string; occurredAt: string;
  kind: 'POLICY_STATUS'; idempotencyKey: string; status: PolicyStatusResult;
}
export interface CallbackRepository {
  accept(tx: Transaction, input: { callbackId: string; adapterId: string; adapterVersion: string;
    eventId: string; idempotencyKey: string; occurredAt: string;
    rawBodyHash: string;                    // SHA-256 hex of the exact raw bytes; same eventId with a different hash -> CONFLICT
    rawPayloadEnc: string; canonicalPayloadEnc: string; receivedAt: string; expiresAt: string }): Promise<CallbackAcceptResult>;
  purgeExpired(tx: Transaction, now: string): Promise<number>;
}
```

Strict schema and max raw body 1MiB (413 `callback_too_large`); malformed verified JSON/schema → 400 `callback_schema_invalid`; unknown submission binding → 404 `integration_submission_not_found`. Event time cannot be later than receivedAt+5min. Cursor scope is tenant+adapter+business key. Older time, or equal time with conflicting status, → 409 `callback_stale`. Duplicate eventId returns 200 `{ status: 'duplicate' }`; accepted callback returns 200 `{ status: 'accepted' }`. Same eventId with a different body hash → 409 `callback_event_conflict`.

Durable dedup key, cursor update, encrypted raw payload and outbox event commit atomically in the RLS transaction; lock the cursor before comparing. Kernel Inbox alone is insufficient: its published API has no caller tx, so a crash between handler commit and inbox marking can repeat effects. Reuse its consumer/event naming semantics, but make CallbackRepository's tenant-scoped unique constraint the authoritative transaction boundary; no kernel API change proposed. Emit `integration.callback.received` `{ callbackId, adapterId, adapterVersion, kind, idempotencyKey }`; consumers fetch canonical content by callbackId through a scoped internal reader, rather than receiving P3 data in outbox logs. M09 still rejects illegal business transitions even when callback time is newer.

### 3.7 Canonical v1 models (`domain/canonical.ts`)

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

### 3.8 Status treatment

| Status | Jobs | Alerts and lists | Payment path |
|---|---|---|---|
| CLOSED / OPEN / HALF_OPEN | Record probes; pass / skip / admit bounded probes | Health board shows state; no separate breaker alert | Routing follows admission |
| PASSED / FAILED | Certification writes result | Health badge; no separate certification alert | Only PASSED API/FILE adapters are eligible |
| SENDING | Wait for lease; recover expired lease through GET_STATUS | No M08 alert; M09 `proposal_unknown_open` owns the 2 h monitor; no submission list | M09 owns eligibility |
| PENDING | Claim due GET_STATUS; never resend | No M08 alert (M09 owns the 2 h monitor); no submission list | M09 owns eligibility |
| COMPLETED (submission) | No reconciliation; retention purges `proposalEnc` only | None | M09 owns eligibility |
| DEAD_LETTER (submission) | Retain barrier; operator replay queries status | OPEN dead letter counted in `integration_dead_letters_open` | Does not change payments |
| OPEN (dead letter) | Eligible for replay/discard; retention applies | Included in open count and DLQ list | Replay cannot mark PAID |
| REPLAYED / DISCARDED | Terminal source; a failed replay creates a new linked OPEN | Excluded from open count; included only by matching list filter | Cannot clear barrier |
| NOT_FOUND | Resolve barrier; M09 may create a new attempt/key | No M08 status list/alert | M09 owns eligibility |
| RECEIVED / UNDERWRITING / REQUIREMENTS_PENDING / DECLINED / ISSUED | Resolve receipt; M09 validates proposal/issuance | No M08 status list/alert | M09 owns eligibility; status alone never marks PAID |
| success / failure / unknown | Stop / classify retry / reconcile uncertain submit | Safe outcome logs and metrics | Return facade outcome |
| ACCEPTED / DUPLICATE / STALE / CONFLICT | Commit once / no repeat effects / reject / reject | Safe rejection logs; no callback list | No direct mutation |

Retention runs independently of status. Assisted handoff creates no send barrier. No M08 renewal, dues or reminder
job is introduced. Terminal operational records never enter active-work alerts.


## 4. Ports

### 4.1 Adapter SPI

```ts
export interface InsurerAdapter {                 // the SPI — one implementation per counterparty, versioned package
  manifest(): CapabilityManifest
  quote?(ctx: AdapterContext, req: CanonicalQuoteRequest): Promise<CallOutcome<CanonicalQuoteResponse>>
  submitProposal?(ctx: AdapterContext, p: CanonicalProposal): Promise<CallOutcome<SubmissionResult>>
  getStatus?(ctx: AdapterContext, ref: { idempotencyKey: string; insurerRef?: string }): Promise<CallOutcome<PolicyStatusResult>>
  paymentLink?(ctx: AdapterContext, req: PaymentLinkRequest): Promise<CallOutcome<PaymentLinkResult>>
  probe(ctx: AdapterContext): Promise<CallOutcome<{ latencyMs: number }>>
}
export interface AdapterContext { tenantId: string; idempotencyKey: string; credentials: () => Promise<Record<string, string>>; signal: AbortSignal; logger: Logger }
export interface CredentialVault { resolve(tenantId: string, adapterId: string): Promise<Record<string, string>> }   // secret refs only; never logged
export interface AdapterRegistry { all(): InsurerAdapter[]; get(adapterId: string, version?: string): InsurerAdapter | undefined }
```

### 4.2 Facade and repositories

Use existing kernel `Transaction`, `Principal`, `Logger`, `Clock`, `IdGenerator`, `FieldCipher`, plus an injected `RandomSource` (`next(): number` in [0, 1), token `RANDOM_SOURCE`) for retry jitter so AC-M08-04 is deterministic. RetryPolicy's random callback delegates to the injected source's next method. Gateway facade methods take no caller transaction: the gateway opens its own unit(s) of work for `principal.tenantId`, and callers (M09) must commit their own state before calling and must not call from inside an open transaction. Repository methods stay `(tx, ...)` inside the gateway's units of work. Jobs construct a trusted principal from persisted work, never HTTP input. No tenantId overload is exposed.

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
  submitProposal(principal: Principal, input: CanonicalProposal, idempotencyKey: string): Promise<GatewaySubmissionResult>;
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
  createdAt: string; payloadExpiresAt: string; discardReason?: string; replayedFromId?: string;
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
  recordProbe(
    tx: Transaction,
    adapterId: string,
    version: string,
    probe: IntegrationHealthRecord['probes'][number],
  ): Promise<void>;
}
export interface SandboxCertificationRunner {
  run(adapterId: string, adapterVersion: string): Promise<Certification['checks']>;
}
export type InsurerUrlAllowlist = Readonly<Record<string, readonly string[]>>;
```

Bind INTEGRATION_HEALTH_REPOSITORY, SANDBOX_CERTIFICATION_RUNNER and
INSURER_URL_ALLOWLIST in integration.module.ts. InsurerUrlAllowlist is a map from
insurerId to exact HTTPS origins, validated at startup and supplied through module
deployment wiring. It adds no database configuration table or administration UI.
Missing bindings fail closed. Returned document/payment URLs with embedded
credentials, an unlisted origin or a non-HTTPS scheme become a non-retryable
CallOutcome failure with safe code integration_url_invalid. Never return or log
the rejected URL. Later configuration sources can supply the same map.

Extend registry lookup to `get(adapterId: string, version?: string)`; when omitted, return only if exactly one version is registered. Define `paymentLink?(ctx: AdapterContext, req: PaymentLinkRequest): Promise<CallOutcome<PaymentLinkResult>>`. The SPI signatures above apply. The status facade copies its key into both AdapterContext and the getStatus reference. PinRepository owns M08 pins; M01 supplies tenant directory and secret references, without M08 importing M01 repositories. Publish symbol tokens with these exact interface names, plus `INTEGRATION_GATEWAY = Symbol('IntegrationGateway')`.

```ts
export type GatewaySubmissionResult =
  | (GatewayResult<SubmissionResult> & { kind: 'DIRECT' })
  | {
      kind: 'RECONCILED';
      route: 'API' | 'FILE';
      adapterId: string;
      adapterVersion: string;
      reconciliationId: string;
      status: PolicyStatusResult;
    };
```

### 4.3 Internal readers

Publish IntegrationCallbackReader and IntegrationReconciliationReader in M08
application/ports.ts, with symbol tokens INTEGRATION_CALLBACK_READER and
INTEGRATION_RECONCILIATION_READER. These are internal cross-module ports, not
public HTTP routes. Use the caller's tenant RLS transaction for reads, no IO calls.

```ts
export interface IntegrationCallbackReader {
  get(tx: Transaction, callbackId: string): Promise<CanonicalCallback | undefined>;
}
export interface IntegrationReconciliationReader {
  get(tx: Transaction, reconciliationId: string): Promise<PolicyStatusResult | undefined>;
}
```

Unknown/cross-tenant IDs return undefined. Callback content past its 180-day
expiry returns undefined (reconciliation results do not expire); consumers record a safe unresolved/manual-review condition rather
than fabricating an issuance. Only module consumers receive these bindings;
HTTP controllers never expose them. Authorized P3 reads emit an access audit
through the trusted execution context. Callback persistence must store callbackId
explicitly and return it on ACCEPTED, so the atomic outbox reference is defined.
Callback accept-result union:

```ts
export type CallbackAcceptResult =
  | { kind: 'ACCEPTED'; callbackId: string }
  | { kind: 'DUPLICATE'; callbackId: string }
  | { kind: 'STALE' }
  | { kind: 'CONFLICT' };
```


```ts
export type ReplayPayload =   // encrypted in integration_payload; identifies what a dead letter replays
  | { kind: 'OUTBOUND'; operation: 'QUOTE' | 'PAYMENT_LINK'; input: CanonicalQuoteRequest | PaymentLinkRequest }
  | { kind: 'SUBMISSION_STATUS'; reconciliationId: string };
```

ReplayPayload is never added to list responses or outbox logs. OUTBOUND inputs must
match operation. SUBMISSION_STATUS resolves the bound SubmissionRecord. Callback
consumers are not replayed through M08 (§5.2).


## 5. Application services

| Service | Behaviour |
|---|---|
| IntegrationGateway | Select route; assisted supplies instructions without send intent; API/FILE submissions reserve intent, all external calls use reliability controls and persist safe outcomes. No transaction spans external IO. |
| ProbeJob | runOnce probes pinned versions with 30000ms deadline; updates breaker and health. p95 uses last 20 completed probes. |
| ReconciliationJob | runOnce claims original-version status work with leases; no automatic resend. |
| RetentionJob | runOnce purges call logs at 90 days and payloads (including `proposalEnc`) at 180 days. |
| DeadLetterService | Tenant-scoped list/detail, audited payload access, synchronous replay and discard with reason. |
| CallbackService | HMAC verification; atomic accept/cursor/ciphertext/outbox; downstream delivery through the kernel outbox. |
| CertificationService | Five sandbox checklist checks; persist exact tenant+adapter+version PASSED/FAILED result. |

Certification checklist: HAPPY_PATH, DECLINE, TIMEOUT, DUPLICATE_CALLBACK and SCHEMA_DRIFT. Run against the adapter's sandbox double, never production calls or production breaker samples. Persist results for exact tenant+adapter+version; all five checks must pass. A separate per-tenant sandbox credential binding is future scope. The assisted adapter supplies instructions; M09 owns operator evidence capture, with no invented M08 portal-record endpoint.

SandboxCertificationRunner executes those five checks for the exact version using
scriptable sandbox doubles, without production credentials, breaker samples or
production call metrics. CertificationService derives PASSED only when every
named check occurs once and passes; it owns storage, status, audit and permissions.
The one-method runner can later be replaced by a real sandbox implementation.

ProbeJob uses IntegrationHealthRepository.recordProbe to atomically append and
trim observations to the latest 20 completed probes. Preserve lastOkAt even when
its observation leaves the window; derive the existing health projection and
nearest-rank p95 from that bounded history. No separate probe pipeline is added.

Jobs expose `runOnce(): Promise<void>`, invocable per run like the M07 jobs; durable leases prevent duplicate reconciliation across processes. Intended cadence: probe every five minutes, reconciliation every minute, retention daily. Wiring a deployment scheduler or in-process timers is future scope. Missing historical adapter versions raise `adapter_version_unavailable` and remain unresolved.

### 5.1 Replay (synchronous)

`POST /integrations/dead-letters/{id}/replay` runs the replay inside the request.
There is no replay queue, table or job.

1. Read the OPEN dead letter (else 409 `dead_letter_closed`). Recheck current
   certification (else 422 `adapter_not_certified`), original version availability
   and payload expiry (else 410 `integration_payload_expired`).
2. With no open transaction, make one attempt with the original adapter, version
   and idempotency key, through breaker, bulkhead and timeout (no retries):
   OUTBOUND repeats QUOTE or PAYMENT_LINK; SUBMISSION_STATUS runs one GET_STATUS
   for the bound SubmissionRecord and resolves its barrier on an authoritative
   status. Replay never submits a proposal.
3. In one unit of work, mark the source REPLAYED with a conditional update
   (`where status = 'OPEN'`) and record the result. On failure, create one OPEN
   replacement with `replayedFromId` set to the source. If the conditional update
   finds the entry already closed, return 409 `dead_letter_closed` and discard
   this result.

Two concurrent replays can both make the call; this is safe because the call reuses
the original idempotency key. A crash before step 3 leaves the entry OPEN, so it can
be replayed again. M08 records quote and payment-link results without changing
payment state.

### 5.2 Callback processing

Signature/schema/stale/conflict rejection never creates a dead letter or a retry.
An accepted callback commits once and emits `integration.callback.received` through
the kernel outbox. Consumers (M09) subscribe as usual: the outbox relay retries a
failing handler and dead-letters the event after `MAX_DELIVERY_ATTEMPTS` (3),
logging `outbox.event.dead_lettered`. This is the HLD §12 three-strike rule. Kernel
outbox dead letters do not appear in the M08 dead-letter screen; surfacing them is
future scope. Consumers validate their own business transitions.

### 5.3 Payment ownership

M08 paymentLink validates canonical input, safe integer paise and allowed HTTPS
URLs; it does not classify proposal/payment eligibility or mark payments PAID.
M09 owns those business rules and insurer confirmation. NOT_FOUND, DECLINED or
ISSUED status therefore does not silently mutate payments in M08.


## 6. API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/integrations` | `integration.read` (TENANT_ADMIN, OPS) — adapters available, pinned version, certification, breaker state, last probe |
| PUT | `/api/v1/integrations/{adapterId}/pin` | `integration.write` — `{ version }` |
| POST ✱ | `/api/v1/integrations/{adapterId}/certifications` | `integration.write` — runs the checklist |
| GET | `/api/v1/integrations/dead-letters?status=` · GET `/api/v1/integrations/dead-letters/{id}` | `integration.read` (TENANT_ADMIN, OPS); payload decrypted only with `integration.write` |
| POST ✱ | `/api/v1/integrations/dead-letters/{id}/replay` · POST ✱ `/api/v1/integrations/dead-letters/{id}/discard` | `integration.write` (TENANT_ADMIN, OPS) |
| POST | `/api/v1/callbacks/{adapterId}` | public, HMAC-verified; 401 on bad signature (security log), 409 on stale |

Dead letters are tenant data and are handled by the tenant itself: routes live under `/api/v1/integrations/dead-letters` (§6), tenant comes from the verified Host like every tenant route, and TENANT_ADMIN and tenant OPS receive `integration.read`/`integration.write`. Platform operators have no dead-letter route and never see payloads; they monitor aggregate metrics and use safe tenant-scoped logs to help on request. No cross-tenant list/inspection is introduced. Platform-operator tenant access is future scope (docs/hld/FUTURE-SCOPE.md). Mutating POST operations except signed callbacks require Idempotency-Key under §04.

| Endpoint | Success status/body | Additional errors |
|---|---|---|
| GET integrations | 200 `{ items: AdapterHealth[] }` | standard 401/403 |
| PUT pin | 200 `{ adapterId, version, updatedAt }` | 404 `adapter_not_found`; 422 `adapter_version_unavailable` |
| POST certifications | 200 `Certification` (FAILED is a result, not HTTP failure) | 404 `adapter_not_found` |
| GET dead-letters | 200 `{ items: DeadLetter[], nextCursor? }` | 400 invalid status/limit/cursor |
| GET dead-letter detail | 200 `{ entry: DeadLetter, payload?: unknown, payloadExpired: boolean }` | 404 `dead_letter_not_found` |
| POST replay | 200 `{ id, status: 'REPLAYED', result: 'SUCCEEDED' \| 'FAILED', replacementId? }` | 409 `dead_letter_closed`; 410 `integration_payload_expired`; 422 `adapter_not_certified` |
| POST discard | 200 `{ id, status: 'DISCARDED' }`; body `{ reason: string }` trimmed 1..500 chars | 400 `discard_reason_required`; 409 `dead_letter_closed` |

`AdapterHealth` = `{ adapterId, adapterVersion, counterparty, pin?: AdapterPin, certification?: Certification, breakers: Array<{ operation, state }>, lastProbe?: { at, outcome, latencyMs, lastOkAt?, p95Ms? } }`. p95 uses the last 20 completed probes (sorted nearest-rank); unset before any probe. Dead-letter list sorts createdAt descending then id, default limit 25/max100; never includes decrypted payload. Detail decrypts only for `integration.write` and emits an access audit. Replay runs synchronously (§5.1); a failed replay creates a linked new OPEN entry without mutating the terminal source. Health and certification diagnostics contain only safe codes, no payload fragments. All actions audit actor, target, action and safe reason codes.

## 7. DDL — `080_integration.sql`

`integration_pin`, `integration_certification`, `integration_call_log`, `integration_breaker_state`, `dead_letter`, `callback_raw`.

080 adds §7 tables plus `integration_submission` (SubmissionRecord), `integration_payload`, `integration_callback_cursor` and `integration_health`. All except platform breaker state are tenant scoped with forced RLS using existing kernel conventions. Credentials are secret references only. Unique pin/certification keys include tenant and version as appropriate; callback dedup includes tenant+adapter+eventId; submission business key is tenant+idempotencyKey. State, attempt, expiry and lease fields enforce the unions above. JSONB canonical payloads/results are encrypted strings at rest; no plaintext answers, policy numbers, URLs or external error messages in call logs.

Call log is a plain tenant-scoped table indexed on (tenant_id, at); RetentionJob deletes rows at exact 90-day age. Monthly partitioning is future scope (revisit at call-log volume targets). Payload retention uses elapsed UTC time of 180 days, independently of IST business dates. Purge ciphertext/raw bodies at expiry, retaining minimal dedup hashes and unresolved safety barriers; submission records and their encrypted results are kept (record purge is future scope). RetentionJob cleans payloads even for OPEN dead letters. Raw callback storage includes the raw-body hash needed to detect changed duplicates. Background tenant enumeration does not bypass RLS for tenant reads/writes; only platform breaker snapshot storage uses the owner pool.

integration_health has one tenant-scoped row per adapter+version, a bounded JSON
probe history and lastOkAt. Appends are atomic, so concurrent probes do not lose
observations. Use the existing table; no additional health table is introduced.

RetentionJob calls SubmissionRepository.purgeProposalBefore with now minus
180 elapsed days; it clears only proposalEnc where createdAt <= before, including
COMPLETED records. Preserve inputHash, state, resultEnc, resultKind and barriers.
CallbackRepository.purgeExpired clears rawPayloadEnc and canonicalPayloadEnc where
expiresAt <= now, preserving minimal dedup hashes and cursor state. Both return
the number of rows whose ciphertext was cleared; repeating the same purge returns
zero. Existing EncryptedPayloadRepository and IntegrationCallLog handle the other
payload and call-log retention. No general retention framework is introduced.

Replacement dead letters have a unique non-null tenant+replayed_from_id. Reconciliation claims lock rows, use SKIP LOCKED, and fence writes by lease. Callback rows store callbackId, canonical ciphertext, raw ciphertext and raw hash; both ciphertexts expire at 180 days. No credentials are stored. Submission resultKind and encrypted discriminated result support DIRECT/RECONCILED replay. integration_submission enforces its state union, non-negative attempts and forced tenant RLS.

## 8. Observability
Metrics `integration_calls_total{adapter,operation,route,outcome}`, `integration_call_duration_ms{adapter,operation}` (histogram), `integration_breaker_state{adapter,operation}` (gauge 0/1/2), `integration_dead_letters_open` (gauge, business monitor); logs carry adapterId, operation, idempotencyKey, latency — never request/response bodies or credentials; security logs `security.callback_rejected`.

integration_dead_letters_open is an aggregate gauge with no tenant label.
Compute each tenant's OPEN count within its app-role RLS transaction; emit a safe
job summary with verified tenantId and count for tenant diagnosis. TENANT_ADMIN
and OPS use the existing tenant DLQ list; introduce no platform inspection route.
Counts exclude REPLAYED and DISCARDED, even when their payload remains retained.

The HLD §16 "unknown submissions older than 2 hours" monitor is owned by M09
(`proposal_unknown_open`). M08 adds no separate unknown-age monitor.

## 9. Frontend — W12 `IntegrationsScreen`
Adapter cards (insurer, version pin, certification badge, breaker state chip, last probe + p95), "Run certification" with checklist results, dead-letter table (TENANT_ADMIN, OPS of the tenant) with inspect/replay/discard and reason.

## 10. Acceptance criteria
- **AC-M08-01** Manifest validation rules; route selection prefers API, then FILE, skips open breakers and uncertified adapters with reasons, and always falls back to ASSISTED.
- **AC-M08-02** Circuit breaker opens at the failure-rate threshold after minimum calls, counts slow calls, half-opens after the open period and closes after successful probes.
- **AC-M08-03** Bulkhead caps concurrency per counterparty and rejects when the queue is full.
- **AC-M08-04** Retry: exponential backoff with full jitter (deterministic with injected random), retries only retryable outcomes, reuses the same idempotency key.
- **AC-M08-05** Timeout on submit → unknown outcome → status query scheduled; M08 never resubmits. NOT_FOUND permits M09 to start a new attempt with a new key.
- **AC-M08-06** Dead letter after three failed/unknown status queries; permanent non-retryable async failures create one immediately with the actual attempt count. Replay uses the same key and never resends a proposal; discard needs a reason; payloads encrypted and purged at 180 days.
- **AC-M08-07** Callbacks: bad signature 401 + security log, timestamp outside ±5 min rejected, duplicate event processed once, stale transition rejected.
- **AC-M08-08** Probe job updates health and breaker; certification gates routing per tenant.
- **AC-M08-09** Call logs and logs never contain payloads or credentials (asserted with a canary value).
- **AC-M08-10** Postgres: migration, RLS, 90-day call-log retention. *(integration)*
- **AC-M08-11** Integrations screen: cards, certification run, dead-letter operations.

Additional acceptance evidence under the same IDs:

- AC-M08-01: type/validation cases for assisted timeout omission, future capabilities and version/counterparty selection.
- AC-M08-04/05: crash immediately before/after send, repeated caller key, lease recovery, pin changes during unknown, late response, NOT_FOUND new-attempt behavior, and no submit during DLQ replay/discard.
- AC-M08-06/10: concurrent replay claims; expiry boundaries; actual app-role RLS; restart preserves dedup, barriers, jobs and encrypted content; exact 90-day call-log pruning.
- AC-M08-07: cross-tenant signature/binding rejection, changed duplicate body (rawBodyHash -> 409 `callback_event_conflict`), concurrent stale cursor updates, handler rollback and crash/redelivery.
- AC-M08-08/09: probe p95 and canary scans of logs, call-log rows and outbox payloads.
- AC-M08-11: version pin and certification results, detail access, discard reason, replay result, expired payload, permissions, loading/empty/error states and English/Hindi keys.
- AC-M08-05: DIRECT/RECONCILED responses are type-safe; full terminal failure replay; a completed key replays its stored result after `proposalEnc` is purged.
- AC-M08-06: synchronous replay; concurrent replays close the entry once (second gets 409); crash before close leaves it OPEN; one linked replacement on failure; replay never submits proposals.
- AC-M08-07: accepted callback reference storage/read audit; a failing consumer is retried and dead-lettered by the kernel outbox after three attempts; acceptance is not repeated.
- AC-M08-08: aggregate metrics have no tenant labels; tenant summaries use verified context; terminal dead letters excluded from the open count.
- AC-M08-05: a stale state/lease makes save return false; no stale result or event is committed, including late direct-send completion after recovery.
- AC-M08-06/10: completed proposal ciphertext and both callback ciphertexts purge at the exact 180-day boundary; results, dedup metadata and barriers remain; repeated purge returns zero.
- AC-M08-08/10: health appends retain the latest 20 probes without lost concurrent observations; lastOkAt survives trimming; p95 uses nearest rank.
- AC-M08-08: sandbox certification runs all five unique checks with no production credentials, breaker samples or call metrics.
- AC-M08-09: unsafe document/payment URLs fail with integration_url_invalid without leaking the URL; allowlist configuration rejects invalid origins at startup.
