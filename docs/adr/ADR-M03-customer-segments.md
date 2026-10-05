# M03 customer segments "With dues" and "No policy"

Status: Accepted

Approval: the user approved this ADR on 2026-10-05 (decisions 1–4). Before acceptance the orchestrator corrected decision 2: the draft named a status `OVERDUE` and a 30-day horizon constant, neither of which exists in M07; it now uses the M07 `DueStatus` values and the 7-day window of `DueService.today`.

## Context

M03 §frontend (`/crm/customers`, `CustomersScreen`) lists segment chips All, With dues, No policy and Tags. `GET /parties?q=&tag=&householdId=&limit=&cursor=` (M03 §6) has no parameter that selects either segment. The current web screen sends `tag=with_dues` and `tag=no_policy`, which match no tag and return 0 rows (BUG-11, `docs/quality/WP-C1-findings.md`). Policies and dues are owned by M07 (book and retention); M03 must not read M07 tables directly.

## Decisions to approve

1. Add an optional `segment` query parameter to `GET /parties`: `segment=with_dues | no_policy`. Unknown values return 400 `validation_failed`. `segment` combines with `q`, `tag` and `householdId` using AND, and with the caller's record scope as today.
2. Definitions (IST calendar dates, `kernel/domain/ist.ts`):
   - **With dues**: the party is the policyholder of at least one non-terminal held policy (M07 `TERMINAL_STATUSES` excluded) with an installment that `classifyInstallment` classifies today as `DUE_TODAY`, `IN_GRACE` or `RENEWAL_DUE`, or as `UPCOMING` with a due date within 7 days — the same set `DueService.today` returns.
   - **No policy**: the party has no held policy in any status, as policyholder or insured.
3. M07 exposes a read port `PartyBookSegmentReader` (`partyIdsWithDues(tx, scope, today)`, `partyIdsWithAnyPolicy(tx, scope)`), registered by M07 and consumed by M03 through a DI token, following the existing cross-module reader pattern (ADR-M07). M03 applies it as an id filter inside its list query. Postgres implements it as a semi-join under the caller's RLS transaction.
4. Segment chips show counts only if a count source is approved. This ADR proposes **no counts** for With dues and No policy (the chip renders without a badge), matching the lead saved-view rule in M04 §frontend.

## Consequences

- M03 §6 route table, M03 §frontend `/crm/customers` row and M07 §4 (new reader) change in the sections they affect once accepted.
- New ACs: one for each segment (including a terminal policy that must not count as a due, and an insured-only party that must not count as "No policy").
- WP-B4 removed the broken `tag=with_dues|no_policy` requests and hid the two chips; the follow-up build adds the filter and shows the chips again.
