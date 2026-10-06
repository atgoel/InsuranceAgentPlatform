# Handover

Read this first in every new session (see "Session protocol" in CLAUDE.md), then update it before ending.
Compacted on 2026-10-06. The full history up to that date is in git: `git show 3046c0d:docs/HANDOVER.md`.

## State (last code commit 2531b3f, branch `claude/jolly-volta-k4kfdi`, not pushed since M08)
| Module | Status | Quality |
|---|---|---|
| M00 Kernel, observability, web shell | done; Keycloak sign-in (ADR-007), PWA (ADR-008), runtime config ADR-010 built, JWKS refetch ADR-011 built | M00.md 94.2 A (stale) |
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
Last full gates (63b9915, 2026-10-06): core 2132, web 811, smoke PASS (int not rerun: no Postgres code changed; last 170 at f470aad). Lint: core 0 errors / 1 warning, web 0 errors / 6 warnings.

## Environment and tools
- Windows. Postgres only: `docker compose -f infra/dev/docker-compose.yml up -d` (port 5433). Reset: `down -v`, then `up -d` (needs user approval if the demo data matters).
- Demo stack: `... --profile app up -d`, then `node scripts/demo-seed.mjs` (idempotent; reruns after `down -v` re-link Keycloak). Ports: Keycloak :8180 (admin/admin, realm `iap`), core :3000, web :8080, prototype :8081.
- Personas (password `Demo@1234`): priya.sales, rahul.manager, anita.admin, vikram.po, meera.ops.
- Images: `node scripts/build-images.mjs [ref]` builds from a commit, never the working tree; then `up -d --no-build core web`.
- Worktrees: `node scripts/worktree.mjs new <task>` (`../IMF-<task>` on `ui/<task>`, runs `npm ci` + deps check). In the main checkout use `npm install`, never `npm ci`.
- Phone mode: `IAP_PHONE_HOST=<LAN IP> node scripts/stack-mode.mjs phone`, back with `node scripts/stack-mode.mjs local` (no rebuild; web reads `/config.js`, ADR-010). See `docs/dev/phone-https.md`. Second stack: `docs/dev/isolated-stack.md`. Remove caddy: `--profile app --profile phone rm -sf caddy`.
- UI checks: `node scripts/ui-sweep.mjs [--routes] [--personas] [--login-only] [--ignore-https-errors]` → `reports/ui/`. On Git Bash set `MSYS_NO_PATHCONV=1`.
- Gate under load is flaky (web files near 5 s, AC-M07-08). Ask the user to close heavy processes (Codex) before full gates; rerun only failing files.

## Conventions
- Persistence per module via `KERNEL_OPTIONS.persistence` (`byPersistence()`; pattern `tenancy.module.ts`, `pg-tenancy.repositories.ts`). Tenant Pg repos use the caller's RLS transaction; platform data uses PLATFORM_POOL.
- P3 personal data: `kernel/crypto/aes-gcm-field-cipher.ts`.
- ESLint errors on `max-statements-per-line` 1 and `max-len` 180. No prettier config in repo.
- Agent claims are re-verified by rerunning the gate (past agents claimed passes on tests that never ran).

## Last batch — done (session imf-40, 2026-10-06)
T1 `jwks-race` (6104b41), T2 `runtime-config` (b446b98), T3 `stack-mode` (8c87e50), merged 63b9915; fix 2531b3f.
- Spec: ADR-011 (JWKS: shared in-flight fetch, throttle only after success), ADR-010 decisions 5-6, M00 LLD JwksTokenVerifier + §13.7 + AC-M00-33 (720510b, e5882a3).
- Revert proofs: T1 by the orchestrator (old code: concurrent verify `Promise.all (index 1)` rejects `Invalid or expired token`, spec.ts:103; failed-fetch retry rejects, spec.ts:121). T2 by the agent (AC-M00-37 `expected { demoLogin: false, …(2) } to deeply equal { …(3) }`; AC-M00-38 `expected "vi.fn()" to be called 1 times, but got 0 times`).
- Real path: images built from 63b9915; `stack-mode local → phone → local` all PASS (phone needed 2531b3f: `up --wait` fails on the exited one-shot `keycloak-phone`). One persistent Chrome profile: local priya→rahul, phone https://192.168.29.100 vikram→meera, local anita→priya; sign-out + reload stays `/login`, config authority correct each time, `/config.js` `no-store`, not in `sw.js`. Keycloak stopped + fresh page: sign-out lands on `/login` (AC-M00-38).
- Orchestrator fixes on agent work: `web-config.sh` omits `demoLogin` when `IAP_DEMO_LOGIN` is unset (LLD wording); stale `build web` bullet in `isolated-stack.md`.
- `SignOutButton.tsx` unchanged: `signOut()` no longer rejects on end-session failure, so its "Sign-out failed" branch only covers storage errors.

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
16. Delete empty `../IMF-a3` (held by a user `cmd.exe` opened from Explorer) and leftover `../IMF-runtime-config/apps/web` (worktree pruned, folder busy).
17. Next steps: re-run `scripts/quality-report.mjs M00`; real-phone check (item 7) now needs no web rebuild.

## Open decisions (user)
- M07 LLD items not listed in ADR-M07, still to confirm: `distanceSale`, general has no post-expiry grace, expiry rewrite on payment/renewal, `GET /servicing-requests`, `GET /book-imports/{id}`, duplicate-header suffixes.
- M06 LLD wording vs code: out-of-scope recommendation → 403 `product_out_of_scope`; BI for every LIFE category except TERM; floater amount = family sum insured; gap rounding to ₹1L; share URL is the API path; SIP start-of-month.
- `ADR-M08-future-evolution.md` stays Proposed (approve exact scope before building).
- Proposed (not built): sign-out when Keycloak is down but the page already loaded the end-session metadata (signed in on the same page). `signoutRedirect()` does not reject; the browser shows `ERR_CONNECTION_REFUSED` at Keycloak. The app session is already cleared (app shows `/login`). Option: probe the end-session URL with a short timeout before redirecting, and go to `/login` if it fails. Needs a user decision and an ADR-010 change.
