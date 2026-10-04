# M08 contract clarifications

Status: Draft, revised after user review on 2026-10-04 (see "User review"). Decision 5's operator tenant access is still open. Implementation is not yet authorized against these proposed contracts.

## Context

M08 was authorized to start. Its LLD conflicts on assisted timeout/outcome representation and omits concrete canonical models, facade/repository signatures, callback trust boundaries and durable reconciliation. The working agreement requires reporting gaps rather than inventing them in code. The user authorized drafting these contracts.

## Proposed decisions

1. Preserve the existing success/failure/unknown SPI shape, add unknown reason `assisted`, and make assisted manifest timeouts absent through a discriminated OperationSpec. Assisted means an operator must act; it does not imply an uncertain external send and does not schedule status queries.
2. Define v1 canonical inputs/results and exact transaction+Principal facade signatures in M08 §11.2–3. Tenant identity comes from verified context. Resolve pins and certification by version and insurer. Reserve future capability vocabulary without advertising unsupported callable methods.
3. The gateway facade takes no caller transaction; it opens its own units of work. Callers commit their own state before calling. Commit a durable send intent before external IO. Persist one SubmissionRecord per tenant+business key: the barrier, the encrypted proposal (`proposalEnc`), the encrypted result and the leased reconciliation work, with states SENDING, PENDING, COMPLETED and DEAD_LETTER. Crashes and uncertain sends become status queries against the original adapter/version/key. No automatic proposal resubmission; NOT_FOUND lets M09 terminate that attempt and create a new one, matching M09 §3.3. Discard/replay cannot bypass this barrier.
4. Resolve public callback tenant through verified Host directory and secret binding. Authenticate exact raw bytes with timestamped HMAC; store a raw-body hash so a reused eventId with a different body is rejected; transactionally commit dedup, stale cursor, encrypted raw body and outbox. Kernel Inbox's current signature cannot join the caller transaction, so M08 uses a repository uniqueness boundary while preserving Inbox naming semantics. No kernel API change is needed.
5. Specify operations response/status/error contracts and an inspection GET. Operations remain scoped to the verified tenant even for platform operators. Retain immutable replay/discard terminal states, durable replay jobs, safe audits and encrypted payload expiry.
6. Probe, reconciliation and retention jobs are invocable `runOnce()` methods with durable reconciliation leases; scheduler wiring is deferred. Bulkheads and breakers are per process (the breaker snapshot is informational). Certification runs the checklist against the adapter's sandbox double. Retry jitter uses an injected `RandomSource`.
7. Keep the call log as a plain table and delete rows at the exact 90-day boundary (partitioning deferred). Purge encrypted payloads at 180 days, but retain minimal dedup metadata and unresolved safety barriers. All tenant data uses app-role RLS; platform breaker/partition administration uses the owner pool.

## Cross-module consequences

- M09 must commit the frozen snapshot and SubmissionAttempt before calling the gateway (never from inside an open transaction), apply the returned result in a new transaction, handle assisted as an operator handoff rather than an uncertain send, and consume reconciliation/callback references through scoped readers. Its existing NOT_FOUND/new-attempt rule remains unchanged.
- M07 receives scoped callback references only; M08 does not produce held policies or bypass insurer-confirmed issuance.
- M01 remains the tenant/secret-reference authority. M08 owns adapter pin/certification records; no M01 repository imports or secret values in database/logs.
- The existing FieldCipher lives in the kernel, not M03; use its tenant-derived encryption interface.

## User review (2026-10-04)

- Accepted: the gateway opens its own units of work and M09 commits before calling; the encrypted proposal field and the unified SubmissionRecord (including COMPLETED); `rawBodyHash` on callbacks; injected `RandomSource`.
- Scope reduced: shared cross-process breaker (compare-and-set), scheduler/timer wiring, call-log partitioning and per-tenant sandbox credential binding move to [future scope](../hld/FUTURE-SCOPE.md).
- Open: how a platform operator gets a tenant context for dead-letter operations. Until decided, operations act only in the tenant of the verified token (the current kernel `@OperatorOnly()` behaviour). The proposal is recorded in the future-scope register.

## Approval and build boundary

Approve or amend the seven decisions above. On approval, consolidate M08 §11 into §§3–7 and update M09 transaction/assisted consumption text in the same implementation milestone. The types and API choices are proposed contracts; this draft does not claim compiler validation, implementation, passing gates or vendor certification. No code, migration, commit or push accompanies the draft.
