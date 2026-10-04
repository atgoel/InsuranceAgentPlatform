# Future scope register

Work deliberately left out of a module build so the launch slice stays small. Each entry says where the trimmed contract lives and when to revisit. Linked from HLD §17.

| Area | Deferred item | Current behaviour | Revisit when | Source |
|---|---|---|---|---|
| M08 Integration Hub | Shared cross-process circuit breaker (compare-and-set on `integration_breaker_state`) | Contract: breaker per process; persisted snapshot informational, last write wins; runtime pending | More than one Core instance calls the same insurer API under load | M08 LLD §3.3, ADR-M08 decision 6 |
| M08 Integration Hub | Scheduler/timer wiring for probe (5 min), reconciliation (1 min) and retention (daily) jobs | Contract: invocable `runOnce()` methods and durable reconciliation leases; runtime pending | Deployment scheduler is chosen (same need as M07 lifecycle/renewal jobs) | M08 LLD §5 |
| M08 Integration Hub | Monthly partitioning of `integration_call_log` | Contract: plain table indexed on (tenant_id, at); exact 90-day row delete; runtime pending | Call-log volume makes daily deletes expensive | M08 LLD §7, AC-M08-10 |
| M08 Integration Hub | Per-tenant sandbox credential binding for certification | Contract: checklist against adapter's sandbox double; runtime pending | First insurer offers a real sandbox endpoint | M08 LLD §5 |
| M08 Integration Hub | Platform-operator access to a tenant's dead letters (options below) | Contract: tenant TENANT_ADMIN/OPS handle DLQ; operators use aggregate metrics and safe tenant-scoped logs, without payload access | Tenants need support to replay or diagnose dead letters | ADR-M08 decisions 5 and 8, M08 LLD §§6/8 |
| M08 Integration Hub | Durable replay queue (replay work table, repository, job with leases) | Replay runs synchronously in the request with the original key; conditional close; crash leaves the entry OPEN | Replays become slow or need automatic follow-up | M08 LLD §5.1, ADR-M08-integration-hub #10 |
| M08 Integration Hub | Callback consumer failures on the M08 dead-letter screen | Kernel outbox retries and dead-letters after 3 attempts (`outbox.event.dead_lettered` log only) | Ops need to see and replay failed callback consumers | M08 LLD §5.2, ADR-M08-integration-hub #13 |
| M08 Integration Hub | Purging whole `integration_submission` records | Records and encrypted results are kept; `proposalEnc` purged at 180 days | Submission-record volume or a retention policy requires it | M08 LLD §3.4, ADR-M08-integration-hub #12 |
| M08 Integration Hub | Extended probe history and health summaries | Latest 20 probes in one existing health row, atomic append | Longer incident history or trend queries are needed | [Future ADR](../adr/ADR-M08-future-evolution.md) |
| M08 Integration Hub | Resumable/batched policy-specific retention | Two purge methods on existing repositories and the existing job | Purge time/volume or policy requirements justify it | [Future ADR](../adr/ADR-M08-future-evolution.md) |
| M08 Integration Hub | Certification suite and retained sandbox evidence | One runner with five fixed checks against sandbox doubles | Real sandboxes or more adapters require repeatable evidence | [Future ADR](../adr/ADR-M08-future-evolution.md) |
| M08 Integration Hub | Versioned/tenant-specific URL configuration | Injected insurer-to-HTTPS-origin map | Tenant-specific or deployment-independent updates are needed | [Future ADR](../adr/ADR-M08-future-evolution.md) |
| M08 Integration Hub | Explicit claim revision and ownership diagnostics | Conditional state/lease save; result and outbox commit together | Worker ownership becomes more complex | [Future ADR](../adr/ADR-M08-future-evolution.md) |
| M07 Book | Deployment scheduler for lifecycle and renewal jobs; M12 reminder delivery | Invocable jobs and `book.lifecycle.alert` events | Deployment scheduler / M12 | HANDOVER next steps |
| M07 Book | SQL-side filtering/paging for held policies; incremental import-row writes | Tenant book loaded then filtered; batch rows rewritten per step | Large-book load targets | docs/quality/M07.md |

## Platform-operator access to a tenant (deferred)

Launch decision (2026-10-04): each tenant handles its own dead letters; platform operators do not enter tenant data. If support access becomes necessary, choose one of these. Both keep the rule that tenant comes only from verified context.

### Option B: operator on the tenant's Host (simpler)
- The operator opens the tenant's own domain; the tenant comes from the verified Host, as for every user.
- The guard accepts a workforce `platform.operator` token on any tenant Host. Every action is audited in the tenant's audit log.
- Operators may replay and discard but never see decrypted payloads.
- Cost: one guard change. Weakness: no tenant consent before access (DPDP).

### Option C: support-access grant (stronger)

1. A tenant administrator grants time-boxed support access in M01: tenant, granted by, permission scope (`ops.integration.*`), reason, expiry of at most 72 hours. The grant can be revoked at any time.
2. The operator asks identity for a support token. Identity checks the grant and mints a short-lived workforce token (about 1 hour) with `tenantId` set to the target tenant, role `platform.operator` and claim `supportGrantId`. No request parameter or body ever selects the tenant.
3. Each inspect, replay or discard is audited in the tenant's audit log with the grant id. Tenant administrators can see who used the grant and when.
4. A cross-tenant view shows counts only, such as open dead letters per tenant from the existing `integration_dead_letters_open` metric. It never shows payloads.

Cost: an M01 grant model, identity token minting and audit views.
