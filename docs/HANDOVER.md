# Handover

Read this first in every new session (see "Session protocol" in CLAUDE.md), then update it before ending.

## State (2026-10-04, M07 implemented + review fixes)
| Module | Status | Quality report |
|---|---|---|
| M00 Kernel, observability, web shell | done | docs/quality/M00.md — 94.2 A |
| M01 Tenant & entitlements | done; Postgres adapters done | M01.md — 88.4 B |
| M02 Distribution network | done; Postgres adapters done (021) | M02.md — 96 A |
| M03 Party & consent | done; Postgres adapters done (031) | M03.md — 94.2 A |
| M04 CRM (+ M04b Twenty sync) | done; Postgres adapters done (041) | M04.md — 92 A |
| M05 Product catalogue | done; Postgres adapters done | M05.md — 98.8 A |
| M06 Advice & quote | done (memory + Postgres adapters, web screens) | M06.md — 95.2 A |
| M07 Book & retention | implemented (11c0319) + orchestrator review fixes (uncommitted, see "M07 review fixes") | M07.md — 95.9 A (stale: lint score was inflated by packed one-line code; re-run `scripts/quality-report.mjs M07`) |
| M08–M14 | specs written; not started — need the user's go-ahead; M10 minimal RECEIVED ledger slice supports M07 | — |
| CR-001 sales-register fields | kernel, M01, M03, M04, M07 parts done (cb8a5af, 11c0319), all ACs in built modules tested; M09 §11 and M10 §11 parts wait for those modules | M07.md |

## Environment
- Windows workstation; Postgres via `docker compose -f infra/dev/docker-compose.yml up -d` (port 5433).
- Branch `claude/jolly-volta-k4kfdi`; commit messages end with the Co-Authored-By line.

## Conventions worth knowing
- Persistence is chosen per module by `KERNEL_OPTIONS.persistence` ('memory' | 'pg'); see `catalogue.module.ts` and `tenancy.module.ts` (`byPersistence()`) for the pattern; Pg adapter examples: `modules/tenancy/infrastructure/pg-tenancy.repositories.ts`, `modules/catalogue/infrastructure/pg-catalogue.repository.ts`.
- Tenant-scoped Pg repositories use the caller's RLS transaction (`isPgTransaction(tx)`); platform data uses the owner pool (PLATFORM_POOL).
- P3 personal data is encrypted with `kernel/crypto/aes-gcm-field-cipher.ts`.
- Agent output must be re-verified with the gate; past agents produced vacuous tests and false "done" claims.

## Postgres status (2026-10-03, commit after 90b21d6)
- Every module M01–M05 has Postgres repositories selected by PERSISTENCE=pg; contract tests run the same suite on in-memory and Postgres adapters (`test/<module>/repositories.contract.ts`).
- `test/app/pg-boot.int.spec.ts` boots the whole app on Postgres, runs a lead journey, relays the outbox and re-reads after a restart.
- Gate on a clean DB: core 1552, web 575, pg integration 104 — all pass.

## M06 status (2026-10-03)
- Gate: core 1685, web 609, pg integration 133 — all pass. Review docs/quality/M06.review.json (8.5/10 reviewer; report 95.2 A).
- Domain (calculators, AdviceRecord, QuoteRequest, BiRecord, ShareToken) written by the orchestrator; migration 060_advice.sql (RLS policy `advice_record_draft_only`: finalised rows update 0 rows under the app role).
- Cross-module hooks added: M05 `ScopeResult.entityType`, `CATALOGUE_QUERY` (version-details.reader.ts); M04 `OPPORTUNITY_LOOKUP` + `quote.request.shared` subscriber (DISCOVERY → QUOTE_SHARED); M03 `PartySummary.orgUnitId`; kernel config `SHARE_TOKEN_SECRET` (falls back to `${AUTH_HS256_SECRET}:share` outside production).
- Web ApiError now collects top-level problem extensions (`missing`, `reason`) into `details`.
- Decisions to confirm in the LLD (spec wording, code already does this): recommending an out-of-scope product → 403 `product_out_of_scope` (§3.2 says BusinessRuleError, §6 says 403 — followed §6); BI required for every LIFE category except TERM (so CHILD too); floater amounts = health sum-insured for the whole family vs. sum of per-member covers; protection gap rounds HLV, recommended cover and gap up to ₹1L (AC-M06-01 wording); share URL is the API path `/api/v1/public/quote-shares/{token}` (no public web page yet); retirement/child SIP = start-of-month at the monthly equivalent of the annual return.
- M06 follow-ups: `QuoteService.expireStale` and CRM `SlaSweepJob` have no scheduler yet (no job runner besides the outbox relay); lead-captured parties have no owner, so OWN-scope sellers get 404 on party-only calculator runs / advice (M03/M04 fix: set owner on lead capture); insured parties are checked for existence, not record scope; share links stay valid until expiry after selection (no revocation, no route-specific rate limit); only 13 Hindi keys for advice; pg-boot locks `pv_hdfc_term_v1` permanently in the dev DB (reset the DB for a clean run); `gate.mjs web <paths>` crashes with scoped paths (full web gate is fine).

## Known follow-ups (not blocking)
- Production wiring still missing: HttpTwentyClient + secret manager (FakeTwentyClient is wired), real identity/CRM/content provisioners (stubs), FIELD_MASTER_KEY management.
- In-memory `countOpenToday` approximates "assigned today" with updatedAt; Postgres uses `crm_lead.assigned_at` (exact).
- The development catalogue is seeded only when env=development (tests call `seedCatalogueIfEmpty`).
- Web lint: 16 pre-existing `max-lines-per-function` / hook-deps warnings in older screens.
- Local dev DB can be reset any time: `docker compose -f infra/dev/docker-compose.yml down -v && … up -d`.

## M07 implementation (2026-10-04)
- Base commit: `cb8a5af` — `feat: Implement custom fields across multiple modules (CR-001)`. M07 session changes follow this base; see the latest Git commit for the final snapshot.
- Approved cross-module decisions are in `docs/adr/ADR-M07-cross-module-contracts.md` and affected LLDs: internal birthday month/day projection; durable CRM renewal dedup; minimal M10 RECEIVED ledger. Exact catalogue name/effective-date lookup and M02 composite insurer-code references are documented.
- Domain: premium schedules, IST due/grace/revival classification, lifecycle strategies, payment and annual-renewal transitions; policy/motor identifiers encrypted and masked. Services include scoped policy reads/patches, dues/Today, lifecycle/renewal jobs, servicing, confirmed-sale and party-merge consumers.
- CSV/template and Office register imports validate dates/money/risk/custom/commission fields before writes; review decisions, confirmed scoped referrers, 200-row transaction chunks, durable progress/replay, tenant locks and PII purge. Payment replay uses the durable installment ledger before advancing dues.
- PostgreSQL migrations: 033 birthday, 043 CRM renewals, 070 normalized book tables/RLS, 071 compatibility backfill for an earlier local draft of 070, 100 minimal commission ledger. Held-policy and servicing fields use ordinary columns; DATE reads explicitly cast to text to preserve IST calendar dates.
- Web: due calendar, held-policy panel/detail, import wizard, servicing tracker, party policies tab and Today integration; loading/empty/error/permission states, quoted version headers and CSV duplicate-header handling.
- Final independent orchestrator verification: core 1945, web 670, Postgres integration 154 tests — all pass. The last all-gate command caught a missing author in a web test fixture; corrected fixture was verified by the subsequent quality run's global strict typechecks. Zero lint errors; existing web lint has 17 warnings. A real PostgreSQL HTTP payment/servicing journey survives application restart, preserves payment replay and enforces RLS.
- Final module quality: 95.9 A; backend 115/115 tests, 98% lines and 77.69% branches; frontend 17/17 tests and 95.03% lines. All 15 M07 ACs have behavioral tests; review 8.9/10 has no open High/Critical findings. Report/review: `docs/quality/M07.md`, `docs/quality/M07.review.json`. Coverage includes merged unit/component and real PostgreSQL runs, rather than excluding production PG adapters.
- Booking-channel corrections, clearing, reassignment and import updates recalculate exact M02 insurer-code references. A targeted regression demonstrated the old stale-projection failure before verifying the corrected behavior.
- Verification fixed the old pg-boot fixture's single relay pass: relay publication creates follow-on CRM sync events, so the fixture now drains the target tenant with a bounded loop. No database reset was needed.
- Agents used available Sol 6.1 controls; Sonnet was unavailable and reported. Backend and web were reviewed across author boundaries; subagents did not commit or push.

## M07 review fixes (2026-10-04, uncommitted)
Orchestrator review of the Codex M07 commit `11c0319` found three problem groups; all fixed in the working tree. Gate after fixes: core 1951, web 670, Postgres integration 154 — all pass (integration ran before the final behaviour-neutral `requirePayment` split).
- **Spec.** The M07 LLD header amendments were folded into §3.1–§3.4, §4, §5 and §6 (status table, payment rules, `classifyInstallment`, `alertsBetween(policies, parties, from, to)`, insured-party and closed-policy alert rules, import batch rules, `IssuedPolicyReader`, the two GET routes, register/PATCH bodies, read-view masking). ADR-M07 lists only 4 decisions; the user still has to confirm the others now in the LLD: `distanceSale`, general has no post-expiry grace, expiry rewrite on payment/renewal, `GET /servicing-requests` and `GET /book-imports/{id}`, duplicate-header suffixes. M02/M03/M04/M05/M10 amendment banners were left as they are.
- **Formatting.** Codex had packed whole functions onto single lines (web lines up to 1311 chars), which hid `max-lines-per-function` warnings. Book backend, `test/book` and `apps/web/src/features/book` were reformatted with a one-off `npx prettier@3` (singleQuote, printWidth 140; no config added to the repo). `BookImportScreen` was split into `useBookImport.ts` and `ImportSteps.tsx` (web-builder). Book lint is now 0/0 without packing.
- **Logic.** Each fix has a test; the new HTTP/job tests were shown to fail on the old code.
  - `DueEngine.window` now emits `UPCOMING`. The calendar classifies each installment with the new `classifyInstallment`; it no longer shows `DUE_TODAY` on future dates, and grace end is per installment.
  - The lifecycle job skips terminal policies (`TERMINAL_STATUSES` is exported from `held-policy.ts`).
  - Annual payments after grace are rejected with `renewal_window_expired`. Health grace is 30 days and general has none (`annualGraceDays` in `premium-schedule.ts`).
  - A payment that leaves arrears keeps the policy in GRACE or LAPSED instead of IN_FORCE.
  - GRACE → CLAIMED | SURRENDERED is now allowed.
  - Due-item my-work priority is 0 only for IN_GRACE items whose grace ends ≤ 3 days (general renewal due today = 1).
  - AC tags corrected: `commission/ledger.int.spec.ts` → AC-M07-14; `party/birthday.spec.ts` → AC-M07-06.
- **Pending (user):** delete `apps/core/migrations/071_book_normalize.sql`; it only back-fills Codex's uncommitted local 070 draft and is a no-op on fresh DBs. The agent's deletion was blocked by the permission classifier. The runner tolerates the file disappearing.
- **Watch:** `AC-M07-08 commits 201 rows…` takes ~25 s against the 30 s Jest timeout and timed out once when core and web gates ran in parallel; run gates sequentially.

## Next steps and remaining dependencies
1. M08 start authorized on 2026-10-04. Contract gaps were reported before implementation; user authorized a draft. See M08 LLD §11 and `docs/adr/ADR-M08-contract-clarifications.md`, pending approval. No M08 runtime code or migrations yet. Last commit at draft time: `a1d96d8`. Next: review/approve contracts, consolidate LLD corrections and M09 consumption notes, then delegate bounded builds and independently run gates. Revised after user review: gateway takes no caller tx (M09 commits first), unified `SubmissionRecord` with `proposalEnc` and COMPLETED, callback `rawBodyHash`, injected `RandomSource`; scope reduced (per-process breaker, `runOnce` jobs only, unpartitioned call log, checklist against sandbox double), deferred items in `docs/hld/FUTURE-SCOPE.md`. Still open: platform-operator tenant access (proposal in FUTURE-SCOPE.md) and full ADR approval before build.
2. Wire the real M09 IssuedPolicyReader when M09 exists. Missing production reader explicitly fails the consumer and retains the event for retry; tests prove insurer-confirmed registration and replay through an injected reader.
3. Wire a deployment scheduler for lifecycle and renewal jobs, and M12 reminder delivery. These are invocable jobs/events today, without invented future-module implementations.
4. Complete the remaining M10 rate cards, calculations, performance reporting and screens in its own milestone; only the append-only RECEIVED import ledger is included now.
5. Scalability follow-up: PostgreSQL book filtering currently scans tenant policies and import persistence rewrites remaining batch rows. Correctness is covered, but these should be optimized before large-book load targets are claimed. Generic in-memory UOW does not roll back unexpected dependency faults; production PostgreSQL transactions do.
