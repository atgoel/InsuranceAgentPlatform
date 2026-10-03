# M08 · Integration Hub — low-level design

Status: Ready for build · Depends on: M00 (kernel), M01 (tenant directory for per-tenant adapter pins and credentials refs) · Requirements: Rev 3.0 F18 (API quote/submission/issuance; assisted route always available), F57–F59 (gated vendors on the same SPI) · HLD D6, §9 "Adapter SPI" and "Reliability contract for every external call", §12 failure table (insurer API down → assisted with banner), §16 business monitors (dead-letter depth) · Screens: W12 `Integrations` (adapter health board, DLQ operations)

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
| `DeadLetterService` | list/inspect (payload decrypted only for `ops.integration.read`), replay, discard (audit) |
| `CallbackService` | verify → inbox → map to canonical event `integration.callback.received` `{ adapterId, kind, idempotencyKey }` for M09/M07 |
| `CertificationService` | per tenant per adapter: checklist runs against `FakeInsurerAdapter`-style sandbox (happy path, decline, timeout, duplicate callback, schema drift) → PASSED/FAILED; only PASSED adapters are routable for that tenant |

## 6. API
| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/integrations` | `integration.read` (TENANT_ADMIN, OPS) — adapters available, pinned version, certification, breaker state, last probe |
| PUT | `/api/v1/integrations/{adapterId}/pin` | `integration.write` — `{ version }` |
| POST ✱ | `/api/v1/integrations/{adapterId}/certifications` | `integration.write` — runs the checklist |
| GET | `/api/v1/ops/dead-letters?status=` · POST ✱ `/api/v1/ops/dead-letters/{id}/replay` · POST ✱ `/discard` | operator `ops.integration.*` |
| POST | `/api/v1/callbacks/{adapterId}` | public, HMAC-verified; 401 on bad signature (security log), 409 on stale |

## 7. DDL — `080_integration.sql`
`integration_pin` (tenant, adapter, version), `integration_certification`, `integration_call_log` (no payloads; 90-day retention partitioned by month), `integration_breaker_state` (platform scope), `dead_letter` (payload_enc), `callback_raw` (payload_enc, received_at; purge job 180 days); RLS on tenant tables.

## 8. Observability
Metrics `integration_calls_total{adapter,operation,route,outcome}`, `integration_call_duration_ms{adapter,operation}` (histogram), `integration_breaker_state{adapter,operation}` (gauge 0/1/2), `integration_dead_letters_open` (gauge, business monitor); logs carry adapterId, operation, idempotencyKey, latency — never request/response bodies or credentials; security logs `security.callback_rejected`.

## 9. Frontend — W12 `IntegrationsScreen`
Adapter cards (insurer, version pin, certification badge, breaker state chip, last probe + p95), "Run certification" with checklist results, dead-letter table (operator) with inspect/replay/discard and reason.

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
- **AC-M08-10** Postgres: migration, RLS, retention partitions. *(integration)*
- **AC-M08-11** Integrations screen: cards, certification run, dead-letter operations.
