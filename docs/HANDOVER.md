# Handover

Read this first in every new session (see "Session protocol" in CLAUDE.md), then update it before ending.

## State (2026-10-03, M06 done)
| Module | Status | Quality report |
|---|---|---|
| M00 Kernel, observability, web shell | done | docs/quality/M00.md — 94.2 A |
| M01 Tenant & entitlements | done; Postgres adapters done | M01.md — 88.4 B |
| M02 Distribution network | done; Postgres adapters done (021) | M02.md — 96 A |
| M03 Party & consent | done; Postgres adapters done (031) | M03.md — 94.2 A |
| M04 CRM (+ M04b Twenty sync) | done; Postgres adapters done (041) | M04.md — 92 A |
| M05 Product catalogue | done; Postgres adapters done | M05.md — 98.8 A |
| M06 Advice & quote | done (memory + Postgres adapters, web screens) | M06.md — 95.2 A |
| M07–M14 | specs written; not started — need the user's go-ahead | — |
| CR-001 sales-register fields | docs/spec/change-requests/CR-001-sales-register-fields.md; Reference = referrer (customer-confirmed); **approved 2026-10-03**; **next**; build before M07 | — |

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

## Next steps
1. **CR-001** (approved): implement after M06 per the CR (held-policy/sale fields, risk_details schemas, custom-field registry, "Office sales register" import profile, AC-CR001-01..06).
2. Then stop and ask before M07.
