# Future scope register

Work deliberately left out of a module build so the launch slice stays small. Each entry says where the trimmed contract lives and when to revisit. Linked from HLD §17.

| Area | Deferred item | Current behaviour | Revisit when | Source |
|---|---|---|---|---|
| M08 Integration Hub | Shared cross-process circuit breaker (compare-and-set on `integration_breaker_state`) | Breaker held per process; persisted snapshot is informational, last write wins | More than one Core instance calls the same insurer API under load | M08 LLD §11.3, ADR-M08 |
| M08 Integration Hub | Scheduler/timer wiring for probe (5 min), reconciliation (1 min) and retention (daily) jobs | Jobs are invocable `runOnce()` methods; durable leases already prevent duplicate reconciliation | Deployment scheduler is chosen (same need as M07 lifecycle/renewal jobs) | M08 LLD §11.4 |
| M08 Integration Hub | Monthly partitioning of `integration_call_log` | Plain table indexed on (tenant_id, at); exact 90-day row delete | Call-log volume makes daily deletes expensive | M08 LLD §11.7, AC-M08-10 |
| M08 Integration Hub | Per-tenant sandbox credential binding for certification | Checklist runs against the adapter's sandbox double | First insurer offers a real sandbox endpoint | M08 LLD §11.6 |
| M08 Integration Hub | Platform-operator tenant access for dead-letter operations (proposal below) | Operators act only in the tenant of their verified token (`@OperatorOnly()`) | Platform ops must support more than one tenant | ADR-M08 "User review" |
| M07 Book | Deployment scheduler for lifecycle and renewal jobs; M12 reminder delivery | Invocable jobs and `book.lifecycle.alert` events | Deployment scheduler / M12 | HANDOVER next steps |
| M07 Book | SQL-side filtering/paging for held policies; incremental import-row writes | Tenant book loaded then filtered; batch rows rewritten per step | Large-book load targets | docs/quality/M07.md |

## Proposal: platform-operator tenant access (open decision)

Keep the rule that tenant comes only from verified context, and add a support-access grant:

1. A tenant administrator grants time-boxed support access in M01: tenant, granted by, permission scope (`ops.integration.*`), reason, expiry of at most 72 hours. The grant can be revoked at any time.
2. The operator asks identity for a support token. Identity checks the grant and mints a short-lived workforce token (about 1 hour) with `tenantId` set to the target tenant, role `platform.operator` and claim `supportGrantId`. No request parameter or body ever selects the tenant.
3. Each inspect, replay or discard is audited in the tenant's audit log with the grant id. Tenant administrators can see who used the grant and when.
4. A cross-tenant view shows counts only, such as open dead letters per tenant from the existing `integration_dead_letters_open` metric. It never shows payloads.

Until this is built, operators keep working in the tenant of their token.
