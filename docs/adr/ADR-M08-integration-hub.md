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
