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
| M07 Book & retention | implemented (11c0319) + orchestrator review fixes (9284d3c, see "M07 review fixes") | M07.md — 95.9 A (stale: lint score was inflated by packed one-line code; re-run `scripts/quality-report.mjs M07`) |
| M08 | implemented and reviewed; commit containing this handover publishes M08 | docs/quality/M08.md — 96.8 A |
| M09–M14 | specs written; not started; M10 minimal RECEIVED ledger slice supports M07 | — |
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

## M07 review fixes (2026-10-04, commit 9284d3c)
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
- `071_book_normalize.sql` (back-fill for Codex's uncommitted local 070 draft) removed in 9284d3c; the migration runner tolerates its absence on databases that applied it.
- **Watch:** `AC-M07-08 commits 201 rows…` takes ~25 s alone; its timeout was raised from 30 s to 90 s in bbb5db9 after it timed out under full-suite load. Run gates sequentially.

## Formatting enforcement (2026-10-04, commit bbb5db9)
- ESLint (core and web) now errors on `max-statements-per-line` (max 1) and `max-len` 180 (strings, template literals, URLs, comments and regexps ignored). This stops packed one-line code that hid `max-lines-per-function` warnings (see AGENTS.md "Lessons from the M07 review", commit 67d9031).
- The 61 violating files were reformatted with a one-off `npx prettier@3` (singleQuote, printWidth 140, trailingComma all); no prettier config or dependency was added. This is formatting only: `prettier --debug-check` on the HEAD copies passed (identical ASTs), and the working files byte-match the formatted HEAD copies.
- Gate after the change: core 1951, web 670, Postgres integration 154 — all pass; core lint 1 warning, web lint 17 warnings (pre-existing).
- New visible warning: `apps/core/src/modules/advice/infrastructure/pg-advice.repositories.ts:213` `save` is 72 lines (> 60). Packing had hidden it; it was left unsplit because this change was formatting-only.

## Local demo stack and Keycloak sign-in (2026-10-04, ADR-007, uncommitted)
- Run: `docker compose -f infra/dev/docker-compose.yml --profile app up -d --build`, then `node scripts/demo-seed.mjs`. Services: Postgres :5433, Keycloak 26 :8180 (admin/admin; realm `iap` imported from `infra/dev/keycloak/iap-realm.json`), one-shot `migrate`, `core` :3000 (pg, HS256 + RS256 JWKS), `web` :8080 (nginx, proxies `/api`, `/health`), static `prototype` :8081. Without `--profile app` only Postgres starts (gate unchanged).
- Demo personas (password `Demo@1234`): priya.sales SALESPERSON, rahul.manager BRANCH_MANAGER, anita.admin TENANT_ADMIN, vikram.po PRINCIPAL_OFFICER, meera.ops OPS. Dev realm asserts `amr: [pwd, mfa]` for privileged users (dev only).
- Boot bugs fixed: `apps/core/src/main.ts` looked up provider `'KernelConfig'` (now `KERNEL_OPTIONS`), so `node dist/main.js` always exited 1 silently; `apps/web/src/main.tsx` default `baseUrl: '/api'` made every request throw (now `window.location.origin`). Entry points have no tests; container healthchecks prove them.
- Built (ADR-007, M00 §5.1, §11, §13.7, AC-M00-32/33): `kernel/tenancy/jwks-token-verifier.ts`, `composite-token-verifier.ts`, shared `validateClaims`/`principalFromClaims` in `jwt.ts` (aud string or array), config `AUTH_JWKS_URL`/`AUTH_ISSUER`/`AUTH_AUDIENCE`; web `lib/auth/oidc.ts` (oidc-client-ts, code + PKCE), `demo-personas.ts`, `LoginPage` (persona dropdown when `VITE_DEMO_LOGIN=1`), `AuthCallback`, `AuthGate` redirect to /login; DevLogin removed. `POST /api/v1/dev/tokens` unchanged.
- Verified: kernel-scoped core tests 603 pass, kernel lint clean; web gate 700 pass, 17 pre-existing warnings. Full core gate fails only on the parallel session's uncommitted M08 files (`modules/integration`, `test/integration/gateway.spec.ts`, `capability-manifest.spec.ts`). E2E: scripted browser flow (Keycloak login page with login_hint, PKCE code exchange) for all five personas; their RS256 tokens reach the API through the web proxy (Priya leads 8, my-work 12, held policies 6; admin/PO/ops members 5).
- Browser fix (2026-10-04): `FetchApiClient` stored the global `fetch` unbound and called it as `this.fetchImpl(...)`, so every real browser threw "Illegal invocation" and the app showed "Something went wrong" (bug since M00; unit tests always injected fetchImpl). Fixed in `apps/web/src/lib/api/api-client.ts` with a regression test that fails on the old code. Persona homes moved to built screens (TENANT_ADMIN `/console/tenant`, PRINCIPAL_OFFICER and OPS `/console/onboarding`; M00 §13.7 updated). Keycloak data now persists in volume `iap-kc-data`, so recreating the container keeps the seed's `mid`/`ou` links. Verified in headless Chrome (playwright-core in the scratchpad, not the repo) for all five personas on :8080. Web gate 701 pass.
- Dev DB reset with `down -v` on 2026-10-04 (user approved); the seed then ran clean and a second run was a no-op. Priya sees 2 due today (life + health renewal), 1 in grace; policies IN_FORCE, GRACE, LAPSED. The seed sets status at creation because `HeldPolicy.updateStatusFromSource` ignores an `asOf` that is not newer than `statusAsOf` (same-day PATCH is a silent no-op by design). Open: After `down -v` re-run the seed (it re-links Keycloak idempotently). Keycloak `sub` is not the member `userRef` (stub IdentityAdmin). `signOut()` exists but no sign-out button yet. Docker images build from the working tree, so they currently include the uncommitted M08 code.

## Demo readiness and UI parity (2026-10-04)
- Findings (bugs BUG-01…17, UI-01…10, PWA-01…06, lessons): `docs/quality/demo-readiness-findings.md`. Lessons copied into CLAUDE.md.
- Plan with hand-over packages (lanes A foundation, B screens, C data, D PWA, E process), route → artboard map and verification: `docs/plan/ui-parity-and-pwa-plan.md`.
- D1–D6 and ADR-008 approved by the user on 2026-10-04 (plan §6; M00 §13.7 and M04 Today row updated). Keycloak client accepts Vite ports 5173–5179. Next: baseline commit, then wave 1 (A1, A3, A4, C1, C2, E1) in separate worktrees per plan §7–§8.
- Wave 1 started 2026-10-04: worktrees `../IMF-<wp>` on branches `ui/a1`, `ui/a3`, `ui/a4`, `ui/c1`, `ui/c2`, `ui/e1`, all from c014307.
- WP-A1 merged (d105900, merge a509a99): `PageContainer`, `PageHeader`, `KpiRow`, `KpiTile`, `Select`, `DateInput`, `MonthInput`, `SearchField`, `CountChips`, `formatIstDate` in `design-system/`; body uses `--ground`. M00 §13.1, §13.3 and new AC-M00-34 approved by the user. Deviations: internal `FieldShell.tsx/.css` (not exported); `DateInput`/`MonthInput` use `.ds-control` from `FieldShell.css`; `KpiRow` has an outer `.kpi-row-frame`. `PageHeader` needs a Router. Wave 2 branches from a509a99 or later.
- Open: AC-M06-12/13 (`features/advice/screens/QuoteWorkspaceScreen.test.tsx`) time out at 5000 ms under load; passes when the machine is quiet. A test near its timeout is a defect; assign it to the advice owner.
- WP-A3 merged (59b0410, merge e0853d4): `lib/i18n/labels.ts` with `LabelKind` and `useLabel(kind, code)`, 71 EN/HI `labels.*` keys from the LLD enums; an unknown code is returned unchanged and emits the dev-only `i18n.label.unknown` event. The `line` kind covers both M05 LineOfBusiness and M04 ProductLine. Lane B replaces raw codes in its own screens (BUG-09).
- WP-A4 merged (34eccc2, merge eebe2d4): `node scripts/ui-sweep.mjs [--routes a,b] [--personas x,y] [--app URL] [--proto URL] [--out dir]`; on Git Bash set `MSYS_NO_PATHCONV=1`. Output goes to `reports/ui/` (git-ignored). The full sweep on 2026-10-04 took 243 s; flagged per persona: priya.sales 7/28, rahul.manager 4/28, anita.admin 2/28, vikram.po 13/26, meera.ops 5/28. It does not flag wrong counts (e.g. "All open 0" with 5 rows, BUG-10).
- Routed from the A4 sweep: B3 `features/crm/components/LeadsGrid.tsx:64` uses a hash link `#/crm/leads/<id>` (the sweep strips the `#`); B1 `/m/today` lacks date line, KPI tiles, search, quick actions and shows times (BUG-16); A2 `/m/customers` shows "Coming in a later module"; B6 confirm against the LLD whether rahul.manager should get 403 on `/api/v1/roles`, "Access Denied" on `/console/ops/tenants` and 403 on `/console/integrations`. `/crm/customers/:id` was skipped (no customers; C2 seeds them).
- Port: the main checkout's Vite holds 5173 (plan §8.1 gives it to A1); A1 used 5190 for a no-auth gallery.
- WP-C1 merged (3329611): API matches the LLD for BUG-10/11/12; all three are web bugs. Details: `docs/quality/WP-C1-findings.md`. BUG-10 → B3/B1: `GET /leads/stats` gives `open`/`unassigned`; chips hard-code `count: 0` (`LeadsWorkspaceScreen.tsx:145-148`). BUG-11 → B4: `GET /parties` returns 6; `CustomersScreen.tsx:25-29` hard-codes counts and sends `tag=with_dues|no_policy` (returns 0). BUG-12 → B2: `ServicingTrackerScreen.tsx:13` defaults `followUpBefore` to today; the CLAIM follows up on 2026-10-06.
- Open spec decisions (for B3/B4, not approved): SLA-breached and Mine counts are not in `LeadStats` (add to the LLD, derive from list queries, or hide); the With dues / No policy customer segments have no LLD mapping.
- WP-E1 merged (2bc5aca): `node scripts/gate.mjs smoke` builds and boots `dist/main.js` (memory persistence, free port) until `/health/live` is 200, then loads the built web `/login` in headless Chrome; included in `all`, about 25 s warm. Revert proofs: a runtime provider-lookup break (BUG-01 shape) fails smoke core; a throw in `main.tsx` fails smoke web. Gap: the core boot does not exercise the Postgres wiring. `scripts/smoke.mjs` imports `playwright-core` at top level, so run `npm install` after pulling.
- WP-C2 merged (82a32c2, merge 412175c): `scripts/demo-seed.mjs` adds opportunities in DISCOVERY, QUOTE_SHARED, PROPOSAL_COMPLETE, INSURER_PENDING and one LOST, a finalised advice record with a shared quote, and a duplicate party pair; every write is read back, reruns skip existing data. `scripts/demo-leads.csv` (10 rows) previews as 10 valid. ISSUED cannot be seeded: only the `proposal.policy.issued` event issues (M04).
- BUG-13 fixed (7089741), user-approved option: the dev tenant seeder takes the legal name from `DEV_TENANT_LEGAL_NAME` (compose sets "Sharma Insurance Marketing Firm Pvt Ltd"); unset keeps the host-derived name. The seeder never updates an existing tenant, so the running dev DB still shows the old name until the DB is reset (`down -v`, needs the user's approval) and the demo seed is re-run.
- Wave 1 complete: A1, A3, A4, C1, C2, E1 merged; all wave-1 worktrees and local branches removed. `origin/ui/a1` (at c014307) still exists on the remote. Gates on 412175c: web 741, core 2107, smoke PASS. Next: wave 2 (A2, B1, B3, then B2, B4, B5, B6) from 412175c or later.

## Wave 2 (2026-10-04/05)
- Decisions (user, 2026-10-04): lead chips SLA breached and Mine carry no count; All open/Unassigned use `/leads/stats` (M04 §frontend rows, 78b8fba). Customer segments With dues / No policy: `docs/adr/ADR-M03-customer-segments.md` is **Proposed** (needs approval); B4 hides both chips and builds no filter until accepted.
- Merged on `claude/jolly-volta-k4kfdi`: A2 shells (bd36cbc), B1 (573e145), B3 (83aa6e8), greeting fix f367d6c (Today reads `Session.name`, set by `lib/auth/oidc.ts` from `name`/`preferred_username`), B2 (5219888), B5 (8e68283), B6 (8484df3), B4 (merge 4c38857). Each package was built by a Sonnet web-builder in its own worktree; merges were conflict-free.
- Orchestrator verification on 4c38857: `gate.mjs web` typecheck PASS, lint 0 errors / 6 warnings (was 17), tests 770/770; `gate.mjs smoke` PASS; core untouched. Full sweep on :8080 after rebuilding `web`: `reports/ui/wave2/` — every flag is an expected 403 permission state (direct route visit; nav hides those entries). Found and fixed: book dues/servicing showed inline text with controls on 403; now `PermissionDenied` (a00141e, AC-M00-28 tests failed before the fix). Gate on a00141e: web 771/771, lint 0 errors / 6 warnings.
- Slow tests (near 5 s timeout) shortened without raising timeouts in advice, book, tenancy, party. Under heavy machine load (external Codex processes) full runs still flaked; the merged gate on a quieter machine was green.
- Deviations to confirm with the user:
  - A2 `nav.ts` permissions: Onboarding `distribution.member.read`, Users & roles `distribution.role.read`, Brand `tenant.brand.write`, Configuration `tenant.custom_field.write`; Operator tenants uses nav-only key `ops.tenants` (matched by `ops.*`) in a "Platform" section not listed in M00 §13.7; sidebar also has EN/हि and Sign out in its footer; "collapsible" = collapsible sections.
  - B1: Today greeting picks morning/afternoon/evening by IST hour; quick action `/m/leads?new=1` opens the new-lead form.
  - B2: month subtitle total is summed client-side; Due calendar chips are the LLD line filter, not the artboard status filter; "1 dues" plural is wrong; DS `Stepper` overflows at 390 px.
  - B3: pipeline cards have no insurer/owner (not in `OpportunityView`); owner filter options come from owners seen in loaded lists (no members endpoint for CRM); lead record lacks owner select and "Not the same"; `OpportunityCard.tsx:26` uses `Date.now()` for age.
  - B4: "Tags" chip reveals a tag field sending `tag=`; owner shown as raw `ownerMemberId`; "Create opportunity" omitted (`/crm/pipeline/new` not routed); merge always sends `survivor: 'A'`; party-role/purpose labels are feature-local keys (no A3 kind).
  - B5: calculator next-step links `/m/research?line=LIFE`, `/m/compare?line=HEALTH` are not in the M06 LLD.
  - B6: fixed BUG-14 by correcting `TenantProfile` (status/scope at top level, M01 §5); app route `/console/users-roles` vs LLD `/console/users`; Brand toggle relabelled "Hide badge"; operator KPIs count first 50 tenants only; invite fixes role SALESPERSON. Backend findings: `/licences/expiring` 403 for PO/OPS/BM although M02 §3.5 implies licence.read from member.read; Head office `memberCount` 0 while its child has 5.
  - LLD confirms rahul.manager 403 on `/roles` and everyone in the customer realm 403 on `/ops/tenants`.
- Open: `crm/screens/LeadRecordCustomFields.test.tsx:59,66` flaked once on loaded machine (`findByText('₹2,500.00')` default 1 s wait; the B3 `LeadRecordScreen` renders slower) — shrink render cost or fixture (B3 owner). Design-system `PermissionDenied`/`ErrorState` have hard-coded English; `gate.mjs web <paths>` crashes (vitest rejects `--silent <path>`); `/crm/customers/:id` is skipped by the sweep (rows open a panel, not a link); `../IMF-b1` and `../IMF-b5` leftover folders are locked by stale handles — delete later.
- Next: wave 3 (B7, D1, D2, E2); approve or reject ADR-M03-customer-segments.

## Wave 2 close-out (2026-10-05)
- User decisions (2026-10-05): ADR-M03 customer segments **Accepted**; ADR-009 (owner names, `POST /opportunities` + Create opportunity sheet, `plan.canHidePoweredBy`) **Accepted** (all 3); calculator next-step links kept (now in M06 §frontend); the other Wave 2 deviations above were agreed and folded into their LLD sections (M00 §13.7, M01, M02, M03, M04, M07).
- Merged on `claude/jolly-volta-k4kfdi` (not pushed): segments backend (e86ca2c), fix-core (licence.read implied by member.read; subtree `memberCount`), fix-web (operator nav, 50+ KPIs, plural, stepper), adr9-core + adr9-web, gate fix, AC-M07-08 speed-up, i18n (design-system states, advice Hindi, all 137 missing Hindi keys + parity test in `i18n-keys.test.ts`), flaky distribution hook tests (blind sleeps replaced by `await act`). Final merge f470aad.
- Orchestrator verification on f470aad: core 2126/2126 (lint 0 errors, 1 old warning), web 794/794 (lint 0 errors, 6 warnings), Postgres int 170/170 (on d71bd2e; later merges are web-only), smoke PASS. Containers rebuilt; sweep `reports/ui/adr9/` (customers, pipeline, brand × priya/rahul/anita): 0 flags; owner names, segment chips, pipeline owner filter and the disabled Hide badge toggle seen in screenshots.
- Spec correction at build: `POST /opportunities` 404 code is `party_not_found` (kernel convention), 403 `member_required` without a member id (M04 route table, ADR-009 note).
- Agent deviations accepted: pipeline owner filter options come from owners seen on loaded boards; the service also rejects non-integer premium with `invalid_premium` (zod rejects first); `CreateOpportunitySheet` builds line labels with `t('labels.line.X')`; AC-M07-08 fixture uses distinct holder names, and `aes-gcm-field-cipher.ts` caches HKDF keys per tenant.
- Agent claim rejected: the Haiku gate fix said "passes" but the test never ran (empty `node_modules` in the new worktree). Lesson: new worktrees need `npm ci`; verify agent claims by rerunning.
- Open (not blocking): native review of three Hindi terms (`crm.pipeline.discovery`, `crm.tasks.cadence_rules`, SLA as एसएलए); party duplicate detector decrypts up to 50 candidates per imported row (slow for large imports); `PartyBookSegmentReader` makes one facade call per policy (optimise before large books); `create-opportunity.spec.ts` slow under load (heavy seller setup); `OpportunityCard.tsx:26` uses `Date.now()`; sweep skips `/crm/customers/:id`; BUG-13 dev DB reset (`down -v`) needs user approval; locked `../IMF-b1`, `../IMF-b5` folders.
- Next session: wave 3 (B7 login layout, D1 PWA, D2 phone HTTPS, E2 clean-build process).

## Wave 3 Session B (2026-10-05): WP-D2 + WP-E2
- Split: Session A (peer session) = B7 + D1; Session B = D2 + E2. Files are disjoint (Session A owns apps/web, nginx-web.conf, package*.json, smoke.mjs).
- WP-E2 merged (084e46d, merge 5beed22): `node scripts/worktree.mjs new <task> [--base ref] [--dry-run]` adds `../IMF-<task>` on `ui/<task>`, runs `npm ci` and checks `node_modules/vitest` and `jest`; `check [path]` runs only the deps check. `node scripts/build-images.mjs [ref] [--dry-run]` builds `iap-core:dev`/`iap-web:dev` from a detached temp worktree of the commit (never the working tree, BUG-17), tags `:<sha12>`, removes the temp worktree in `finally`; then start with `up -d --no-build core web`. Doc: `docs/dev/worktrees-and-images.md`. Verified: real `new` run by the orchestrator (npm ci 210 s, PASS); `check` fails on a folder without node_modules; build-images dry run only.
- WP-D2 merged (a7c068d, merge f837d76): compose profile `phone`. One variable `IAP_PHONE_HOST`; `--env-file infra/dev/phone.env` derives `IAP_KC_URL=https://<host>:8443`, `IAP_DEV_TENANTS` (localhost + host) and `KC_PROXY_HEADERS=xforwarded`. Caddy (`tls internal`, local CA) serves `https://<host>` (web) and `:8443` (Keycloak). The one-shot `keycloak-phone` (`infra/dev/keycloak/phone-client.mjs`) adds the host to the `iap-web` redirect URIs, web origins and post-logout URIs, idempotently, also on a persisted realm. Doc: `docs/dev/phone-https.md`. Caddy was chosen over a tunnel (ADR-008 allows either), because a tunnel would expose dev Keycloak publicly. Verified: the default `--profile app config` differs from 5883a80 only by `KC_PROXY_HEADERS: null` (not set in the container); the phone render is correct; `caddy validate` passes and the internal CA issued a cert for a bare IP; the script's dry run against the live Keycloak printed the 3 additions.
- Not verified yet (blocked: the shared stack was in use by Session A; phone mode changes the issuer for every client): a real `build-images.mjs` run; a live phone-profile boot (Keycloak behind xforwarded, core JWKS through `keycloak:8080` with the https issuer, `keycloak-phone` write, browser login at `https://<host>`); a real phone.
- Known limits: phone mode breaks Vite dev sign-in on localhost (issuer is https); IPv6 literal hosts break the tenant lookup (`split(':')`); a missing `IAP_PHONE_HOST` fails at start of caddy/keycloak-phone (`:?` fails for inactive profiles too). `../IMF-d2` has a broken `node_modules` (npm ci ENOTEMPTY on Windows); remove the worktree after Session A finishes.
- Next: when Session A is done, run `node scripts/build-images.mjs`, then the phone profile live check above; then remove `../IMF-d2` and `../IMF-e2`.

## Next steps and remaining dependencies
M08 implemented and reviewed on 2026-10-04. User approved decisions 1–13,
the explicit amendments and the simple option in this session. The contract and
both accepted M08 ADRs are consolidated; Future ADR remains Proposed. Domain,
application/API, memory/Postgres repositories, migration 080, encrypted readers,
raw callback parsing and W12 are wired. Status treatments were shown before code.
Unknown submissions retain their original version/key and reconcile with status
queries; synchronous replay never submits a proposal. Callback consumer failure
uses the kernel outbox three-strike policy. No EXPIRED result or replay queue.

M08 quality: 152 backend and 26 frontend tests pass; module lint 0/0, types clean.
Report 96.8 A; review 8.7/10. Final `node scripts/gate.mjs all` passed: core 2105,
web 703, PostgreSQL 169; zero lint errors, 1 core and 17 web existing warnings.
No behavior changed after this gate; publication review cleaned trailing blank lines.
Full results are recorded in the hand-back.
Verification, deviations, boundaries and open questions:
`docs/quality/M08-handback.md`, `M08.md` and `M08.review.json`.
Backend and web received cross-author review. Available agents followed project
roles because Sonnet was unavailable. Tests were not consistently written first;
negative-behavior mutation evidence is retained without claiming original TDD.
Real insurer adapters, secret/origin deployment bindings and job scheduling remain
deferred deployment work. PostgreSQL restart/RLS/rollback checks cover production
atomicity; existing memory UnitOfWork has no rollback. User explicitly authorized
review, handover update, commit and push on 2026-10-04. M08 is published by the
commit containing this handover; its parent is `c014307d0fa4b324d56f740cffc736ae02809a47`.
Next: configure real insurer bindings/scheduling only under approved deployment
scope; implement M09 only when requested. Future alternatives remain Proposed.
No further approval is required for the completed M08 contract. Future alternatives
require approval for their exact scope before implementation.
2. Wire the real M09 IssuedPolicyReader when M09 exists. Missing production reader explicitly fails the consumer and retains the event for retry; tests prove insurer-confirmed registration and replay through an injected reader.
3. Wire a deployment scheduler for lifecycle and renewal jobs, and M12 reminder delivery. These are invocable jobs/events today, without invented future-module implementations.
4. Complete the remaining M10 rate cards, calculations, performance reporting and screens in its own milestone; only the append-only RECEIVED import ledger is included now.
5. Scalability follow-up: PostgreSQL book filtering currently scans tenant policies and import persistence rewrites remaining batch rows. Correctness is covered, but these should be optimized before large-book load targets are claimed. Generic in-memory UOW does not roll back unexpected dependency faults; production PostgreSQL transactions do.
