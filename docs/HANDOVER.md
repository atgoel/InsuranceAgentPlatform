# Handover

Read this first in every new session (see "Session protocol" in CLAUDE.md), then update it before ending.
Compacted on 2026-10-06. The full history up to that date is in git: `git show 3046c0d:docs/HANDOVER.md`.

## State (last commit 3046c0d, branch `claude/jolly-volta-k4kfdi`, not pushed since M08)
| Module | Status | Quality |
|---|---|---|
| M00 Kernel, observability, web shell | done; Keycloak sign-in (ADR-007), PWA (ADR-008), runtime config ADR-010 accepted, not built | M00.md 94.2 A |
| M01 Tenant & entitlements | done (memory + pg) | M01.md 88.4 B |
| M02 Distribution network | done (memory + pg) | M02.md 96 A |
| M03 Party & consent | done (memory + pg); customer segments ADR accepted and built | M03.md 94.2 A |
| M04 CRM (+ M04b Twenty sync) | done (memory + pg); ADR-009 built | M04.md 92 A |
| M05 Product catalogue | done (memory + pg) | M05.md 98.8 A |
| M06 Advice & quote | done (memory + pg, web) | M06.md 95.2 A |
| M07 Book & retention | done + review fixes (9284d3c) | M07.md 95.9 A (stale; re-run `scripts/quality-report.mjs M07`) |
| M08 Integration hub | done and reviewed | M08.md 96.8 A; `M08-handback.md` |
| M09–M14 | specs only; M10 has only the minimal RECEIVED ledger | — |
| CR-001 sales-register fields | done for kernel, M01, M03, M04, M07; M09 §11 and M10 §11 wait | M07.md |

UI parity plan (`docs/plan/ui-parity-and-pwa-plan.md`): waves 1–3 merged (A1–A4, B1–B7, C1–C2, D1–D2, E1–E2) plus follow-ups (sweep `--login-only`, isolated stack).
Last full gates (f470aad / fa90e58): core 2128, web 800, Postgres int 170, smoke PASS. Lint: core 0 errors / 1 warning, web 0 errors / 6 warnings.

## Environment and tools
- Windows. Postgres only: `docker compose -f infra/dev/docker-compose.yml up -d` (port 5433). Reset: `down -v`, then `up -d` (needs user approval if the demo data matters).
- Demo stack: `... --profile app up -d`, then `node scripts/demo-seed.mjs` (idempotent; reruns after `down -v` re-link Keycloak). Ports: Keycloak :8180 (admin/admin, realm `iap`), core :3000, web :8080, prototype :8081.
- Personas (password `Demo@1234`): priya.sales, rahul.manager, anita.admin, vikram.po, meera.ops.
- Images: `node scripts/build-images.mjs [ref]` builds from a commit, never the working tree; then `up -d --no-build core web`.
- Worktrees: `node scripts/worktree.mjs new <task>` (`../IMF-<task>` on `ui/<task>`, runs `npm ci` + deps check). In the main checkout use `npm install`, never `npm ci`.
- Phone mode: compose profile `phone` + `--env-file infra/dev/phone.env` (Caddy TLS, `IAP_PHONE_HOST`), see `docs/dev/phone-https.md`. Second stack: `docs/dev/isolated-stack.md`. Remove caddy: `--profile app --profile phone rm -sf caddy`.
- UI checks: `node scripts/ui-sweep.mjs [--routes] [--personas] [--login-only] [--ignore-https-errors]` → `reports/ui/`. On Git Bash set `MSYS_NO_PATHCONV=1`.
- Gate under load is flaky (web files near 5 s, AC-M07-08). Ask the user to close heavy processes (Codex) before full gates; rerun only failing files.

## Conventions
- Persistence per module via `KERNEL_OPTIONS.persistence` (`byPersistence()`; pattern `tenancy.module.ts`, `pg-tenancy.repositories.ts`). Tenant Pg repos use the caller's RLS transaction; platform data uses PLATFORM_POOL.
- P3 personal data: `kernel/crypto/aes-gcm-field-cipher.ts`.
- ESLint errors on `max-statements-per-line` 1 and `max-len` 180. No prettier config in repo.
- Agent claims are re-verified by rerunning the gate (past agents claimed passes on tests that never ran).

## In progress (session imf-40, 2026-10-06)
Claimed: T1 `jwks-race`, T2 `runtime-config`, T3 `stack-mode` (worktrees `../IMF-<task>`, branches `ui/<task>`). Readiness round done: ADR-010 decisions 5-6 and ADR-011 approved by the user on 2026-10-06. Shared stack switch local → phone → local approved.

## Next batch — ready (ADR-010 accepted, no open gaps)
One session, 3 disjoint tasks, each via `node scripts/worktree.mjs new <task>`:
- **T1 `jwks-race`** (backend-builder; owns `apps/core/src/kernel/tenancy/jwks-token-verifier.ts` + spec). Root cause of the cold-start 401: lines 72-77 set `lastFetchAt` before awaiting the JWKS fetch, so concurrent callers hit the 60 s throttle with an empty key map (`Unknown kid`). Fix: share one in-flight fetch; a failed fetch must not block retries for 60 s. Test `BUG-cold-start-401` (N concurrent `verify()` during a pending fetch all succeed) with revert proof; AC-M00-33 stays green.
- **T2 `runtime-config`** (web-builder; owns `apps/web/src/lib/config/`, `lib/auth/oidc.ts`, `LoginPage.tsx`, `SignOutButton.tsx`, `index.html`, `vite.config.ts`, `infra/docker/web.Dockerfile`, `infra/docker/nginx-web.conf`, new `infra/docker/web-config.sh`). ADR-010 decisions 1–4, AC-M00-37/38: `/config.js` → `window.__IAP_CONFIG__` from `IAP_OIDC_AUTHORITY`, `IAP_OIDC_CLIENT_ID`, `IAP_DEMO_LOGIN`; `no-store`, not precached; `VITE_*` fallback; local sign-out always completes. Real-browser check on the built image.
- **T3 `stack-mode`** (wiring; owns `infra/dev/docker-compose.yml`, `docs/dev/*.md`, new `scripts/stack-mode.mjs`). Web `build.args` → runtime `environment`; drop `IAP_WEB_IMAGE` and `--build` from docs; `stack-mode.mjs phone|local` switches modes and ends with `ui-sweep --login-only`. Merge T2 before T3.
- Orchestrator after merge: full core + web gates, smoke, build images, then local → phone → local in one browser profile (sign out and switch persona each time).

## Backlog for the user to prioritise
Product scope (needs go-ahead, see memory "IAP scope gate"):
1. **M09** (issuance): unblocks the real `IssuedPolicyReader` for M07, CR-001 §11, and seeding ISSUED opportunities.
2. **M10** commissions: rate cards, calculations, reporting, screens, CR-001 §11 (only the RECEIVED ledger exists).
3. **M11–M14**: specs written, not started.

Platform / deployment:
4. Job scheduler for `QuoteService.expireStale`, CRM `SlaSweepJob`, M07 lifecycle/renewal jobs, M12 reminders (only the outbox relay runs today).
5. Production wiring: `HttpTwentyClient` + secret manager, real identity/CRM/content provisioners, `FIELD_MASTER_KEY` management, real insurer adapters (M08).
6. Smoke boots core on memory only; add a Postgres boot.

Verification:
7. Real-phone check: trust the Caddy CA, service worker over https, Install app in the avatar menu (`docs/dev/phone-https.md`).

Performance (before large-book claims):
8. Pg book filtering scans all tenant policies; import persistence rewrites remaining rows; party duplicate detector decrypts up to 50 candidates per row; `PartyBookSegmentReader` one facade call per policy.

Known defects / cleanup (small):
9. M06/M03/M04: lead-captured parties have no owner, so OWN-scope sellers get 404 on party-only calculator runs and advice.
10. M06: share links not revocable after selection, no route-specific rate limit; insured parties checked for existence, not record scope.
11. `OpportunityCard.tsx:26` uses `Date.now()` (inject Clock). `pg-advice.repositories.ts:213` `save` is 72 lines (> 60). 6 web lint warnings.
12. Flaky under load: AC-M06-12/13 (`QuoteWorkspaceScreen.test.tsx`), `LeadRecordCustomFields.test.tsx:59,66`, `shells.test.tsx` AC-M00-32, `create-opportunity.spec.ts`, AC-M07-08.
13. Phone mode limits: IPv6 hosts break tenant lookup (`split(':')`); phone profile only on the default stack; Vite dev sign-in breaks while phone mode is on.
14. Sweep skips `/crm/customers/:id`. Keycloak `sub` ≠ member `userRef` (stub IdentityAdmin). In-memory `countOpenToday` uses `updatedAt`.
15. Native review of Hindi terms: `crm.pipeline.discovery`, `crm.tasks.cadence_rules`, SLA as एसएलए.
16. Delete empty `../IMF-a3` (held by a user `cmd.exe` opened from Explorer).

## Open decisions (user)
- M07 LLD items not listed in ADR-M07, still to confirm: `distanceSale`, general has no post-expiry grace, expiry rewrite on payment/renewal, `GET /servicing-requests`, `GET /book-imports/{id}`, duplicate-header suffixes.
- M06 LLD wording vs code: out-of-scope recommendation → 403 `product_out_of_scope`; BI for every LIFE category except TERM; floater amount = family sum insured; gap rounding to ₹1L; share URL is the API path; SIP start-of-month.
- `ADR-M08-future-evolution.md` stays Proposed (approve exact scope before building).
