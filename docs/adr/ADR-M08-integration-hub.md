# ADR-M08: Integration hub implementation blockers

Status: Accepted

## Context

The 2026-10-04 implementation session read AGENTS.md, HANDOVER.md, engineering
standards, observability and the M08 LLD. The user requires stopping on a missing
or contradictory contract. No runtime code or migration was written.
Approval: on 2026-10-04 the user explicitly replied “Approve all 13” to the
numbered decision table in this session. Decisions 1–7 are in the companion ADR;
this document covers decisions 8–13. Approval covers those decisions only.

## Contract conflicts identified during review (resolved by consolidation)

The section and line references below describe the pre-consolidation draft. The
current contracts are in M08 §§3–8 and §10; these findings are historical context.

1. M08 §4 (line 104) publishes a caller-transaction facade and a tenantId overload;
   §11.3 (lines 227–242) prohibits caller transactions and requires Principal.
   Consolidate one exact signature into §4 before building.
2. §3.1 (lines 51–60) requires timeoutMs while prohibiting assisted timeouts;
   §3.3 (line 76) omits the assisted unknown reason returned in §5 (line 109).
   Consolidate the proposed discriminated manifest and outcome corrections.
3. §3.6 (line 87) mandates kernel Inbox dedup; §11.5 (line 358) instead requires
   a caller-transaction repository boundary. Consolidate one atomic contract.
4. §11.6 (line 362) requires per-tenant dead-letter gauges, while observability
   §5 prohibits tenant metric labels at launch. Define how tenant counts are
   exposed without violating the kernel cardinality contract.

## Contract gaps identified during review (resolved by decisions below)

5. §11.5 (line 358) requires consumers to fetch canonical callbacks by callbackId,
   and §11.4 (line 331) requires authorized reads of reconciliation results.
   No reader names, signatures, tokens or authorization contracts are published.
6. §11.6 (line 374) requires durable replay scheduling and linked replacement
   dead letters, but no replay work record, claim/lease repository, worker contract
   or replacement linkage field is specified in §§11.3–11.7. Define these before
   implementing replay or claiming restart/concurrency safety.
7. Review correction: the getStatus key placement is an ordinary facade-to-SPI
   conversion, not a conflicting signature. Pass the same key in AdapterContext
   and the SPI reference; original adapter/version binding is already specified.
8. Define the unknown-age alert predicate for SENDING, PENDING and DEAD_LETTER,
   including lease age versus creation age. Define whether insurer statuses gate
   paymentLink or whether that eligibility belongs entirely to M09. No payment
   eligibility or state mutation will be inferred by M08.
9. §11.4 permits COMPLETED replay of PolicyStatusResult or an expired body, but
   §11.3 promises CallOutcome<SubmissionResult>, whose success value is mandatory.
   The persisted failure outcome also lacks the code/retryable information needed
   to reconstruct CallOutcome. Resolve the public replay type and failure envelope.

## Review of the existing clarification ADR

Decisions 1–4 in ADR-M08-contract-clarifications.md already propose solutions to
the manifest, assisted, facade, durable barrier and callback atomicity issues.
They are now incorporated into the original LLD sections. Decision 2 previously said transaction+Principal,
contradicting decision 3; that wording has been corrected to no caller transaction.
Decisions 5–7 cover tenancy, retention and deployment scope, but do not publish
the reader/replay contracts or solve the replay result type. Their per-tenant
metric wording conflicts with observability and is revised as a proposal below.
Historical notes remain historical; full approval is recorded above.

## Accepted supplemental decisions (8–13)

### 8. Tenant monitoring and unknown-age ownership

Keep integration_dead_letters_open as an aggregate gauge with no tenant label.
Compute each tenant's OPEN count within its app-role RLS transaction; emit a safe
job summary with verified tenantId and count for tenant diagnosis. TENANT_ADMIN
and OPS use the existing tenant DLQ list; introduce no platform inspection route.
Counts exclude REPLAYED and DISCARDED, even when their payload remains retained.

Amended 2026-10-04 (user): M08 has no separate unknown-age monitor. The HLD §16
"unknown submissions older than 2 hours" monitor is M09's `proposal_unknown_open`,
which already exists; a second M08 predicate would monitor the same thing twice.

### 9. Scoped internal readers

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

Unknown/cross-tenant IDs return undefined. Expired encrypted content returns
undefined; consumers record a safe unresolved/manual-review condition rather
than fabricating an issuance. Only module consumers receive these bindings;
HTTP controllers never expose them. Authorized P3 reads emit an access audit
through the trusted execution context. Callback persistence must store callbackId
explicitly and return it on ACCEPTED, so the atomic outbox reference is defined.
Accepted callback accept-result union:

```ts
export type CallbackAcceptResult =
  | { kind: 'ACCEPTED'; callbackId: string }
  | { kind: 'DUPLICATE'; callbackId: string }
  | { kind: 'STALE' }
  | { kind: 'CONFLICT' };
```

### 10. Replay (amended 2026-10-04 by the user: synchronous)

Replay runs inside the HTTP request: check the OPEN entry, certification, version and
payload; make one call with the original adapter/version/key (no open transaction);
then mark the source REPLAYED with a conditional `status = 'OPEN'` update and, on
failure, create one linked OPEN replacement (`replayedFromId`). A losing concurrent
replay gets 409 `dead_letter_closed`; the duplicate call is safe because the key is
reused. A crash before the update leaves the entry OPEN. A SUBMIT_PROPOSAL dead
letter replays as GET_STATUS; replay never submits a proposal. HLD §12 asks only to
"inspect, fix mapping, and replay", so no durable queue is needed. The text below
is superseded and kept for history.

Superseded original:

Add tenant-scoped integration_replay and DeadLetter.replayedFromId?: string
(the replacement points to its terminal source). Publish ReplayRepository and
ReplayJob, with REPLAY_REPOSITORY token and runOnce(): Promise<void>.
Replay work contains id, sourceDeadLetterId, adapterId, adapterVersion, operation,
idempotencyKey, payloadRef, state READY|RUNNING|COMPLETED|FAILED, attempts,
createdAt, updatedAt, nextAttemptAt and optional leaseUntil/lastErrorCode.

Repository signatures: enqueue(tx, work): Promise<void>;
claimDue(tx, now, leaseUntil, limit): Promise<ReplayWork[]>;
finish(tx, { id, leaseUntil, state, lastErrorCode? }): Promise<boolean>.
The exact TypeScript interfaces are incorporated in M08 §4.3. A unique
tenant+sourceDeadLetterId constraint permits only one replay work item. The HTTP
transaction enqueues work and changes OPEN to REPLAYED atomically. Claims use
60-second leases, batch limit 100, and compare the claim lease on completion;
an expired worker cannot overwrite a newer claim. READY and expired RUNNING
are claimable; COMPLETED/FAILED are terminal and excluded from work alerts.

Recheck certification, original version availability and payload expiry before IO.
GET_STATUS replay queries status and resolves the original submission barrier.
Never submit proposals through replay: a SUBMIT_PROPOSAL dead letter schedules
GET_STATUS using its bound SubmissionRecord. QUOTE/PAYMENT_LINK replay uses the
original operation and key; M08 records its result without changing payment state.
Callback processing replay reuses the accepted callback reference, never its HTTP
signature window. Failures produce one linked OPEN replacement per replay work;
the source remains REPLAYED. No automatic follow-on replay is scheduled.
Crash recovery repeats only idempotent calls with the original key, not claims of
exactly-once external IO. Retention purges any encrypted replay responses through
their original operation's result storage; no separate plaintext result store exists.

### 11. M08/M09 payment and reconciliation responsibilities

M08 paymentLink validates canonical input, safe integer paise and allowed HTTPS
URLs; it does not classify proposal/payment eligibility or mark payments PAID.
M09 owns those business rules and insurer confirmation. NOT_FOUND, DECLINED or
ISSUED status therefore does not silently mutate payments in M08.

M08 owns retry/reconciliation of uncertain sends. M09 consumes its referenced
results and retains its 48-hour status sweep and paid-not-issued monitor; remove
M09's competing 15-minute UNKNOWN query scheduler. M09 handles assisted before
SubmissionAttempt.apply, leaving operator work pending rather than UNKNOWN.
Map RECEIVED/UNDERWRITING/REQUIREMENTS_PENDING/DECLINED/ISSUED to acknowledgment
of receipt, then apply M09's separate proposal transition/issuance validation.
NOT_FOUND rejects the old attempt and permits a new key; never reuse the old key.

### 12. Type-safe completed replay (amended 2026-10-04 by the user)

Amendment: drop the EXPIRED variant. A submission record keeps its encrypted result
for its whole life (only `proposalEnc` is purged at 180 days), so a completed key
always replays DIRECT or RECONCILED. Purging whole records is future scope. Where
the text below mentions EXPIRED or ciphertext expiry for results, it is superseded.


Keep CallOutcome<T> unchanged for adapter SPI. Accepted facade-only result:

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
    }
  | {
      kind: 'EXPIRED';
      route: 'API' | 'FILE';
      adapterId: string;
      adapterVersion: string;
      reconciliationId: string;
      outcome: 'success' | 'failure';
    };
```

IntegrationGatewayPort.submitProposal returns Promise<GatewaySubmissionResult>.
M09 handles these discriminants explicitly; an absent success.value or a
PolicyStatusResult cast to SubmissionResult is prohibited. DIRECT retains the
existing assisted instructions and unknown reconciliationId fields.

Store the full encrypted terminal CallOutcome<SubmissionResult> for direct
responses, including failure classification and safe code. Store reconciliation
results with an explicit DIRECT/RECONCILED discriminator. After ciphertext
expiry, retain only classification and barrier metadata. An EXPIRED replay never
advances M09 to ACKNOWLEDGED or ISSUED from missing evidence; it triggers manual
review. This is an accepted facade contract; the runtime export is not implemented yet.

### 13. Callback poison handling (amended 2026-10-04 by the user: kernel outbox)

Amendment: no CallbackProcessingWork, repository or table. An accepted callback emits
`integration.callback.received` through the kernel outbox; the relay retries a failing
consumer and dead-letters the event after `MAX_DELIVERY_ATTEMPTS` (3), which is the
HLD §12 three-strike rule. Showing kernel outbox dead letters on the M08 screen is
future scope. The text below is superseded and kept for history.

Superseded original:

Signature/schema/stale/conflict rejection never creates a poison DLQ or retries.
The atomic callback accept transaction persists canonical ciphertext and enqueues
the reference event once. A downstream handler failure is retried through durable
consumer work; after three failed deliveries it creates one callback-processing
DLQ referencing callbackId. The callback cursor/dedup acceptance is not undone or
re-applied by that replay. M08 §4.3 publishes CallbackProcessingWork,
CallbackProcessingRepository and the ReplayPayload discriminator; Operation alone
does not distinguish callback processing from outbound GET_STATUS. M08 §5.2 and
§7 define durable claims, three-failure handling and tenant persistence.

## Historical status inventory from the gap review

| Status family | Jobs | Alerts/lists | Payment path |
|---|---|---|---|
| CLOSED / OPEN / HALF_OPEN | Probe updates; normal calls pass / skip / bounded admission | Health board; no explicit alert predicate | Payment-link routing follows admission |
| PASSED / FAILED | Sandbox certification writes result | Health badge; no explicit alert | API/FILE eligible only when PASSED |
| SENDING | Wait for lease; recover expired lease through status query | No submission list; unknown-age predicate missing | Eligibility coupling unspecified |
| PENDING | Claim due reconciliation; never resend | Unknown-age predicate missing | Eligibility coupling unspecified |
| COMPLETED | No reconciliation; expire result ciphertext | No pending alert/list defined | Eligibility coupling unspecified |
| DEAD_LETTER | Keep barrier; replay queries status | Associated OPEN DLQ; unknown-age predicate missing | Discard/replay cannot clear barrier |
| OPEN | Replay/discard eligible; retention still purges payload | Open gauge and filtered DLQ list | Operation-specific replay unspecified |
| REPLAYED / DISCARDED | Terminal source; replay failure creates new OPEN | Exclude open gauge; explicit status lists include them | Cannot clear submission barrier |
| NOT_FOUND | Resolve query; M09 may begin new attempt | No M08 status list/alert | Eligibility unspecified |
| RECEIVED / UNDERWRITING / REQUIREMENTS_PENDING / DECLINED / ISSUED | Resolve reconciliation; M09 validates business transitions | No M08 status list/alert | Eligibility unspecified |
| success / failure / unknown | Stop / classify retry / reconcile uncertain submit; assisted has no query | Safe logs and metrics | Facade returns outcome |
| ACCEPTED / DUPLICATE / STALE / CONFLICT | Atomic accept / no effects / reject / reject | Rejection logs; no callback list | No direct payment mutation |

Retention applies independently of operational status. Terminal DLQ entries do
not re-enter replay; unresolved submission barriers survive ciphertext expiry.
These entries describe the existing text, including proposed §11; they do not
authorize missing behavior or establish a new state machine.

## Consolidation and next step

The approved contracts are incorporated in M08 §§3–8 and §10, including exact
reader, callback accept, replay and callback-processing work signatures. M09
§§3–5 and §10 publish transaction sequencing, assisted handling, completed replay
and reconciliation ownership. M08 §3.8 replaces the historical incomplete status
inventory above. Code, migrations and implementation tests remain outstanding.
Next: delegate bounded builds against these contracts and independently verify
actual code changes. Run gates only when necessary, per the user's latest rule.
No commit or push was performed.

## Implementation boundary addendum (2026-10-04)

Status: Accepted

Approval: on 2026-10-04 the user explicitly said “Ok Simple Option approved,
note everything including the changes for future in Future ADR”. This accepts
the five simple contract completions below. Larger-scale alternatives are
recorded separately in ADR-M08-future-evolution.md and remain Proposed.

This addendum has its own explicit approval, separate from decisions 1–13. The resumed build
reviewed commit `303ce31` and the amended contract: synchronous replay, retained
submission results, no M08 unknown-age monitor and kernel outbox callback delivery.
The accepted decisions are unchanged. Implementation stopped before retaining any
runtime draft, as required by the user's stop-on-missing-contract instruction.

### Missing application boundaries

| Contract requirement | Missing boundary | Recommended addition |
|---|---|---|
| M08 LLD :398, :474, :480: persist health and last-20 probe history/p95 | BreakerStateStore (:328) stores only breaker state; no application read/write contract for integration_health | One small IntegrationHealthRepository: read a record and append a probe atomically |
| M08 LLD :400, :482, :484: purge proposalEnc and both callback ciphertexts at 180 days, including completed records | SubmissionRepository (:117–121) cannot enumerate/purge completed records; CallbackRepository (:158–164) only accepts callbacks | Add explicit ciphertext-purge methods to the existing repositories |
| M08 LLD :405: checklist must use a sandbox double, never production calls | InsurerAdapter and AdapterRegistry (:253–261) expose normal adapters without a sandbox binding | SandboxCertificationRunner boundary, bound to sandbox doubles in infrastructure |
| M08 LLD :223: returned document/payment URLs require a configured insurer allowlist | No allowlist configuration binding or safe validation-failure contract is published | One injected insurer-to-HTTPS-origin map and safe integration_url_invalid failure code |

### Accepted simple contracts

The following are consolidated into the M08 LLD's original port, persistence,
service and acceptance sections. Runtime implementation remains outstanding.

```ts
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

Tokens: INTEGRATION_HEALTH_REPOSITORY, SANDBOX_CERTIFICATION_RUNNER and
INSURER_URL_ALLOWLIST. Health is tenant-scoped; retain only the newest 20 completed
observations, with lastOkAt retained even when its observation leaves the window.
The application derives the existing AdapterHealth projection and nearest-rank
p95. recordProbe appends/trims atomically, avoiding a caller read/modify/write race.
Use one row per tenant+adapter+version in the already planned integration_health
table, with a bounded JSON history. This adds no health endpoint or new status.

Add to SubmissionRepository:
`purgeProposalBefore(tx: Transaction, before: string): Promise<number>`.
Clear only proposalEnc for records with createdAt <= before, preserving inputHash,
status, resultEnc, resultKind and barriers, regardless of operational status.

Add to CallbackRepository:
`purgeExpired(tx: Transaction, now: string): Promise<number>`.
Clear rawPayloadEnc and canonicalPayloadEnc when expiresAt <= now; retain minimal
dedup hashes and cursor state. Return the number of rows whose ciphertext was
cleared, so repeated purges return zero. Existing EncryptedPayloadRepository and
IntegrationCallLog continue to handle DLQ payload and 90-day log deletion.

SandboxCertificationRunner supplies all five named checks for the exact registered
version through a sandbox double; it receives no production credentials and its
calls cannot affect production breakers or call metrics. CertificationService
derives PASSED only when each of the five checks appears once and passes.

InsurerUrlAllowlist is an injected module binding, keyed by insurerId. Each entry
is an exact HTTPS origin. Missing bindings fail closed; returned URLs with embedded
credentials or an unlisted/non-HTTPS origin produce a non-retryable CallOutcome
failure with safe code integration_url_invalid, without returning/logging the URL.
Validate configured origins at startup. Start with deployment/module wiring; no
configuration table, administration UI, extra environment format or kernel-wide
configuration framework is proposed. No new HTTP route or credentials field.

### Submission lease fencing clarification

M08 :484 requires fenced reconciliation writes, while save at :121 accepts only
a mutated record and returns void. Specify how callers know they still own a
claim before committing a result and its outbox event. Recommended replacement:

```ts
save(
  tx: Transaction,
  record: SubmissionRecord,
  expected: { state: SubmissionRecord['state']; leaseUntil?: string },
): Promise<boolean>;
```

Match the persisted state and expected lease atomically before writing. False
means stale ownership: discard the result and publish no reconciliation event.
Direct send completion also compares its original SENDING lease, so a late result
cannot overwrite recovered PENDING work. This proposes no new status/error code.

### Simplicity and extension boundary

These five amendments complete the original requirements rather than extend M08's
business scope. Keep the changes local to the module:

1. Health: one bounded row and a two-method repository; no time-series store or
   probe event pipeline. More history can later use a different repository adapter.
2. Retention: two targeted methods on existing repositories, executed by the
   already specified RetentionJob; no general retention framework or new job.
3. Certification: one runner method executing the existing five checks through
   scriptable sandbox doubles. Return the existing check-result shape; no plugins,
   second registry, production credentials or configurable checklist language.
   A real insurer sandbox runner can later replace the double-backed runner.
4. Allowlist: an injected map and a small URL check; no configuration management
   subsystem. Later configuration sources can supply the same map contract.
5. Fencing: a conditional SQL update using the existing state and lease columns;
   a false result prevents event publication. The memory adapter performs the same
   comparison and update synchronously. No distributed lock service, new state,
   extra lease token or retry framework. Result and outbox writes remain one short
   database transaction, with no lock held during external IO.

Use the existing synchronous replay, per-process breaker, kernel outbox and
invocable jobs. Add no new tables beyond the original M08 table list, public
routes, screens, queues or schedulers. The sandbox runner owns executing checks;
CertificationService owns certification storage, status, audit and permissions.

Approval covers these five local contract completions. It does not change the
previously accepted business behavior or authorize the larger-scale alternatives.
See [Future ADR](ADR-M08-future-evolution.md) for comparisons and revisit triggers.
No runtime code or test run accompanies this documentation update.

### Findings that do not need contract changes

- Callback equal-time comparison can use the existing injected FieldCipher to
  decrypt canonical ciphertext inside persistence; no plaintext status field is
  required solely for the comparison.
- DeadLetterRepository.save can implement the specified conditional OPEN close
  and throw the already specified dead_letter_closed when another replay wins.
- Existing RequestContext and AuditLog support scoped-reader access audits.
- main.ts already enables rawBody; the tenant resolver supports callback Host
  verification. No raw-body or tenant kernel interface change is proposed.

### Build status

No retained runtime changes, migrations, gates, tests, commits or pushes. The
pre-code status inventory was shown to the user. Agents used the available model
under project-role instructions because Sonnet is unavailable. The simple
contracts are now incorporated into the LLD; resume the bounded implementation.
