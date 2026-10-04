# M08 contract clarifications

Status: Accepted

Approval: on 2026-10-04 the user explicitly replied “Approve all 13” to the
numbered decision table in this session. This accepts decisions 1–7 here and
8–13 in ADR-M08-integration-hub.md. It does not approve additional decisions.

## Context

M08 was authorized to start. Its LLD conflicts on assisted timeout/outcome representation and omits concrete canonical models, facade/repository signatures, callback trust boundaries and durable reconciliation. The working agreement requires reporting gaps rather than inventing them in code. The user authorized drafting these contracts.

## Decisions 1–7

1. Preserve the existing success/failure/unknown SPI shape, add unknown reason `assisted`, and make assisted manifest timeouts absent through a discriminated OperationSpec. Assisted means an operator must act; it does not imply an uncertain external send and does not schedule status queries.
2. Define v1 canonical inputs/results and exact Principal facade signatures without a caller transaction in M08 §3.7 and §4. Tenant identity comes from verified context. Resolve pins and certification by version and insurer. Reserve future capability vocabulary without advertising unsupported callable methods.
3. The gateway facade takes no caller transaction; it opens its own units of work. Callers commit their own state before calling. Commit a durable send intent before external IO. Persist one SubmissionRecord per tenant+business key: the barrier, the encrypted proposal (`proposalEnc`), the encrypted result and the leased reconciliation work, with states SENDING, PENDING, COMPLETED and DEAD_LETTER. Crashes and uncertain sends become status queries against the original adapter/version/key. No automatic proposal resubmission; NOT_FOUND lets M09 terminate that attempt and create a new one, matching M09 §3.3. Discard/replay cannot bypass this barrier.
4. Resolve public callback tenant through verified Host directory and secret binding. Authenticate exact raw bytes with timestamped HMAC; store a raw-body hash so a reused eventId with a different body is rejected; transactionally commit dedup, stale cursor, encrypted raw body and outbox. Kernel Inbox's current signature cannot join the caller transaction, so M08 uses a repository uniqueness boundary while preserving Inbox naming semantics. No kernel API change is needed.
5. Specify operations response/status/error contracts and an inspection GET. Dead letters are handled by the tenant's own TENANT_ADMIN/OPS under `/api/v1/integrations/dead-letters` (`integration.read`/`integration.write`). Platform metrics expose aggregate counts without tenant labels; tenant diagnosis uses verified tenant context and safe logs, as specified in the accepted supplement. Retain immutable replay/discard terminal states, synchronous replay (amended 2026-10-04, see ADR-M08-integration-hub #10), safe audits and encrypted payload expiry.
6. Probe, reconciliation and retention jobs are invocable `runOnce()` methods with durable reconciliation leases; scheduler wiring is deferred. Bulkheads and breakers are per process (the breaker snapshot is informational). Certification runs the checklist against the adapter's sandbox double. Retry jitter uses an injected `RandomSource`.
7. Keep the call log as a plain table and delete rows at the exact 90-day boundary (partitioning deferred). Purge encrypted payloads at 180 days, but retain minimal dedup metadata and unresolved safety barriers. All tenant data uses app-role RLS; platform breaker snapshot storage uses the owner pool.

## Cross-module consequences

- M09 must commit the frozen snapshot and SubmissionAttempt before calling the gateway (never from inside an open transaction), apply the returned result in a new transaction, handle assisted as an operator handoff rather than an uncertain send, and consume reconciliation/callback references through scoped readers. Its existing NOT_FOUND/new-attempt rule remains unchanged.
- M07 receives scoped callback references only; M08 does not produce held policies or bypass insurer-confirmed issuance.
- M01 remains the tenant/secret-reference authority. M08 owns adapter pin/certification records; no M01 repository imports or secret values in database/logs.
- The existing FieldCipher lives in the kernel, not M03; use its tenant-derived encryption interface.

## User review (2026-10-04)

- Accepted: the gateway opens its own units of work and M09 commits before calling; the encrypted proposal field and the unified SubmissionRecord (including COMPLETED); `rawBodyHash` on callbacks; injected `RandomSource`.
- Scope reduced: shared cross-process breaker (compare-and-set), scheduler/timer wiring, call-log partitioning and per-tenant sandbox credential binding move to [future scope](../hld/FUTURE-SCOPE.md).
- Decided: each tenant handles its own dead letters (option A). Platform operators get no dead-letter route and no payload access. Operator access to a tenant (Host-based access or a support-access grant) is recorded in the future-scope register.

## Approval and build boundary

Decisions 1–13 are accepted by explicit user approval in this session. Their
contracts are consolidated into M08 §§3–8 and §10, and M09 §§3–5 and §10.
M08 runtime code and migrations remain unimplemented. No passing-gate, vendor
certification or quality claim accompanies document consolidation. No commit/push.
