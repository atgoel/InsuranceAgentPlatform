# ADR-M08: Future evolution of the integration hub

Status: Proposed

Date: 2026-10-04

## Decision boundary

The user explicitly approved the simple option on 2026-10-04: “Ok Simple Option
approved, note everything including the changes for future in Future ADR”. The
five simple contract additions are accepted in
[ADR-M08-integration-hub](ADR-M08-integration-hub.md#implementation-boundary-addendum-2026-10-04)
and incorporated into the M08 LLD. Runtime implementation remains outstanding.

This ADR records future alternatives, effort comparisons and revisit triggers.
Documenting them is authorized; implementing them is not approved. Each future
change requires its own concrete design, approval, LLD updates and verification.
The original business rules, verified tenant context, encryption, safe logs and
unknown-submission resend barrier remain mandatory for every alternative.

## Approved simple scope versus future alternatives

Scores are architectural estimates, not measurements or delivery commitments.
Effort and future refactoring effort use 1=low to 5=high; lower is better.
Future refactoring estimates assume adoption of the larger-scale design, not
that such a design will be necessary. They do not represent quality scores.

| Area | Approved simple scope | Effort / future refactoring | Future alternative | Effort / future refactoring | Revisit trigger | Extension path |
|---|---|---|---|---|---|---|
| Probe health | One existing integration_health row per tenant/adapter/version; latest 20 probes; atomic append and read; retained lastOkAt; nearest-rank p95 | 2 / 2 | Separate indexed probe history and summary; configurable history retention | 4 / 1 | Operations need longer incident history or aggregate trend queries | Replace/extend health repository; retain existing AdapterHealth API projection |
| Payload retention | Two purge methods on existing repositories; existing RetentionJob; exact expiry; keep results, hashes and barriers | 1 / 2 | Bounded, resumable purge batches with progress, policy-specific retention and purge audits | 4 / 1 | Purges approach transaction/job time limits or multiple retention policies become mandatory | Extend maintenance methods and job orchestration; preserve expiry and resend safety |
| Sandbox certification | One runner performs five fixed checks on scriptable doubles; existing certification result; no production credentials or samples | 2 / 2 | Shared adapter contract suite, isolated sandbox credentials, repeatable fixtures and retained certification evidence | 4 / 1 | A real insurer sandbox becomes available or adapter count makes contract maintenance costly | Replace runner implementation; version any new evidence/credential contracts separately |
| URL allowlist | One injected insurer-to-HTTPS-origin map; startup validation; safe URL rejection | 1 / 2 | Versioned configuration, tenant overrides, change audits and controlled updates | 4 / 1 | Deployment-wide configuration no longer serves tenants or updates must happen without deployment | Supply the same allowlist contract from a new source; tenant overrides require explicit tenancy/precedence design |
| Stale workers | Conditional save compares existing state and lease; false blocks result/event publication; short result/outbox transaction | 2 / 1 | Explicit monotonic claim revision checked at completion, plus ownership diagnostics | 3 / 1 | Additional worker types or ownership requirements exceed the existing state/lease model | Add a migration and repository contract revision; preserve atomic compare/write/outbox semantics |
| Overall | Local module additions, existing tables and jobs | 2 / 2 | More operational flexibility with additional infrastructure | 4 / 1 | Measured needs justify the added work | Evolve one boundary at a time |

The simple option introduces no extra tables, queues, screens, public routes,
schedulers, distributed lock service, general retention framework, certification
plugin system or configuration-management subsystem. Repository/runner boundaries
allow later implementation replacement without redesigning the gateway/screens;
new capabilities may still require explicit port or API changes.

## Other M08 scope already deferred

These items are retained from the existing future-scope register, not newly
approved by the simple-option decision.

| Future item | Current contract | Revisit trigger | Required future design work |
|---|---|---|---|
| Shared circuit breaker | Per-process breaker; persisted snapshot informational | Multiple Core instances need coordinated insurer admission | Shared ownership/CAS behavior and failure semantics; preserve original adapter/version scope |
| Scheduler wiring | Invocable probe, reconciliation and retention jobs | Deployment scheduling mechanism is selected | Dispatch, overlap, tenant enumeration and failure reporting; retain durable reconciliation leases |
| Call-log partitioning | Plain indexed table; exact 90-day pruning | Measured deletion/storage volume makes pruning expensive | New immutable migration and partition maintenance; preserve RLS and exact age boundary |
| Tenant sandbox credentials | Certification against doubles | First insurer provides a real sandbox | Separate secret references, isolation and safe certification runner binding |
| Platform support access | Tenant admin/OPS own DLQ; no platform payload access | Tenant-authorized support access becomes necessary | Decide verified Host access versus time-limited support grant; least privilege and audits |
| Durable replay queue | Synchronous replay; original key; conditional OPEN close | Replay latency or automatic follow-up requirements justify durable work | Work table/claim/lease contracts and truthful pending UI; never resubmit proposals |
| Callback consumer DLQ visibility | Kernel outbox retries and dead-letters after three attempts | Operations need inspection/replay of failed consumers | Scoped inspection/replay contracts; do not repeat callback acceptance or business effects |
| Submission-record purge | Keep record and encrypted result; proposalEnc expires at 180 days | Approved retention requirements or volume demand record cleanup | Specify evidence availability and permanent resend protection before deleting records |

M09 continues to own payment eligibility, insurer-confirmed issuance and the
proposal_unknown_open age monitor. Future M08 changes must not duplicate that
monitor, treat assisted work as an uncertain send or infer a sale from status alone.

## Adoption procedure

Record the actual need and supporting measurements. Choose the smallest change
that meets it, update the affected LLD sections and obtain approval for that exact
scope. Use additive migrations for committed schemas, retain old behavior where
compatibility requires it, and test the changed business rules and boundaries.
Do not build speculative framework components in the current M08 milestone.

## Verification and implementation status

The approved simple option is implemented; see `docs/quality/M08-handback.md` for verification and limitations. This ADR remains Proposed: none of the future alternatives is implemented or certified. Publication of the current M08 implementation does not authorize future alternatives.
