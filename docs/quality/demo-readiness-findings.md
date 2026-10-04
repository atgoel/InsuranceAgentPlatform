# Demo readiness findings (2026-10-04)

Source: the first full run of the stack in Docker with real Keycloak sign-in, a headless Chrome sweep of 28 routes for three personas, and screenshots of the app (:8080) next to the prototype (:8081) at 1440 × 900. The implementation plan is in [`docs/plan/ui-parity-and-pwa-plan.md`](../plan/ui-parity-and-pwa-plan.md).

## 1. Bugs

### Fixed in this session (uncommitted at time of writing)
| ID | Bug | Where | Fix | Proof |
|---|---|---|---|---|
| BUG-01 | `node dist/main.js` always exited 1 with no output: it looked up provider `'KernelConfig'`, which does not exist | `apps/core/src/main.ts` | uses `KERNEL_OPTIONS` | container healthcheck; no unit test covers the entry point |
| BUG-02 | Built web app could call no API: default `baseUrl: '/api'` makes `new URL(path, base)` throw | `apps/web/src/main.tsx` | `window.location.origin` | browser sweep |
| BUG-03 | Every API call failed in a real browser with `TypeError: Illegal invocation` (shown as "Something went wrong"): the client stored the global `fetch` unbound and called it as `this.fetchImpl(...)`. Present since M00 | `apps/web/src/lib/api/api-client.ts:37` | wraps `fetch` | `api-client.test.ts` test fails on the old code |
| BUG-04 | Dev login could not reach any data: lowercase role labels (`agent`) unknown to the backend, no `memberId` (`member_required`), privileged roles had no `amr: mfa` | `lib/auth/dev-login.tsx` | replaced by Keycloak sign-in (ADR-007) | e2e sign-in for 5 personas |
| BUG-05 | Recreating the Keycloak container dropped the seed's `mid`/`ou` user attributes, so sellers got 403 `member_required` | `infra/dev/docker-compose.yml` | volume `iap-kc-data` | forced recreate keeps claims |
| BUG-06 | Seed set GRACE/LAPSED with a same-day PATCH, which the domain ignores without an error (`asOf` must be newer than `statusAsOf`, `held-policy.ts:167`) | `scripts/demo-seed.mjs` | status set at creation | read-back shows GRACE, LAPSED |

### Open
| ID | Severity | Bug | Where / evidence |
|---|---|---|---|
| BUG-07 | Critical | `MobileShell`, `CrmShell`, `ConsoleShell` (M00 §13.7) were never built. `/m` and `/crm` mount a bare `<Outlet/>`; `/console` renders the literal text "Console Shell". No navigation anywhere. AC-M00-32 was reported as passing on placeholders | `apps/web/src/app/routes.tsx:24-130` |
| BUG-08 | High | No sign-out control; `signOut()` exists but nothing calls it, so switching persona needs clearing the browser | `lib/auth/oidc.ts` |
| BUG-09 | High | Raw codes shown to users: `CHILD`, `SAVINGS_LIFE`, `WALK_IN`, `TENANT_ADMIN`, `UNIT_SUBTREE`, upper-case stages | leads, users & roles, pipeline |
| BUG-10 | High | Leads tab badges (All open, Unassigned, SLA breached, Mine) show 0 while the table shows 5 rows and the KPI "Open leads 5" | `/crm/leads`, `/m/leads` |
| BUG-11 | High | Customers list shows 0 for a seller with 8 leads and 6 policyholders (web bug, API filter or missing data: to investigate) | `/crm/customers` |
| BUG-12 | Medium | Servicing tracker shows "No open follow-ups" although the seed opened a CLAIM request (`GET /servicing-requests` returns 1) | `/m/servicing` |
| BUG-13 | Medium | Tenant legal name "localhost Insurance Marketing Firm": the static tenant seeder names the tenant after the host label | `static-tenant-seeder.ts`; seed should set the entity |
| BUG-14 | Medium | Untranslated key `tenancy.setup.status_…` on the tenant screen | `/console/tenant` |
| BUG-15 | Medium | Mobile bottom-nav "Customers" (`/m/customers`) is a "Coming in a later module" placeholder; `/m/me` shows only "Me Shell" | `routes.tsx:40`, `/m/me` |
| BUG-16 | Low | Dates shown as ISO (`2026-10-04`) and times as midnight (`12:00 am`) for date-only dues | due calendar, Today |
| BUG-17 | Process | The full core gate fails on another session's uncommitted M08 files (`modules/integration`, `test/integration/gateway.spec.ts`); Docker images build from the working tree, so they include that WIP | shared worktree |

## 2. Look and feel against the prototype
The design tokens already match the prototype (`theme.css`: `--ink #1b1f27`, `--ground #f4f5f7`, `--line #d5d9e0`, `--accent #1f5fbf`, IBM Plex Sans). The gap is layout, shells and component use.

| ID | Gap | Prototype reference |
|---|---|---|
| UI-01 | No shells (BUG-07): no phone frame, app bar, bottom nav, sidebar, search box, tenant name/role line | `Main`, `CRMLeads` |
| UI-02 | No page frame: white page instead of `--ground`, screens squeezed into a ~1050 px left column, no page header with subtitle and actions | all web screens |
| UI-03 | Native unstyled `<select>`, date and month inputs; filter labels not aligned | leads, dues, users & roles |
| UI-04 | Today: bare numbers; missing date line, "Good morning, {name}", KPI tiles, search, quick actions, "Dues and renewals" card with Call/WhatsApp/Outcome/Open | `Main` |
| UI-05 | Leads: no search box or owner filter, no masked-mobile/date sub-line, no Import CSV action, product/source codes | `CRMLeads`, `LeadsPipeline` |
| UI-06 | Pipeline renders stages stacked vertically; prototype is a horizontal kanban with coloured stage tops, product · insurer · owner · age, expiry/missing-doc flags | `CRMPipeline` |
| UI-07 | Users & roles unstyled: KPI tiles as plain text, role chips with codes, role cards with codes | `UsersRoles` |
| UI-08 | Due calendar: plain day buttons with "0", ISO heading; prototype month grid shows urgency colours and amounts | `DueCalendar` |
| UI-09 | Login is a plain card; prototype landing (`Start`) has a hero and "Enter as" persona cards | `Start` |
| UI-10 | Not compared yet: lead record, customer record, tasks, routing, import/dedup, calculators, compare, quote, research, tenant, brand, onboarding | see plan WP-B* |

## 3. PWA gaps
The HLD calls the agent app a PWA; no LLD specifies PWA behaviour.

| ID | Gap |
|---|---|
| PWA-01 | No web app manifest, icons, `theme-color` or Apple touch meta: the app cannot be installed |
| PWA-02 | No service worker: no app-shell cache, no offline start, no update prompt |
| PWA-03 | No HTTPS path for a phone: OIDC PKCE needs a secure context (`crypto.subtle`), a phone cannot reach `localhost`, and Keycloak `KC_HOSTNAME`, the client redirect URIs and `DEV_TENANTS` are fixed to `localhost` |
| PWA-04 | Offline behaviour exists only on Today (cached my-work, queued activity logs, AC-M04-29); every other screen has no offline policy |
| PWA-05 | Session and OIDC user live in `sessionStorage`: an installed app that is closed signs in again on every launch (Keycloak SSO cookie may make it silent; unverified) |
| PWA-06 | No spec: caching rules for personal data (what may be cached, for how long, cleared on sign-out) are undefined; HLD/DPDP constraints apply |

## 4. Lessons (added to CLAUDE.md as mandatory rules)
1. **Entry points must run in the gate.** `main.ts` and `main.tsx` had no test, so the production boot path never executed until Docker (BUG-01, BUG-02).
2. **Fakes for platform APIs hide browser failures.** Every client test injected `fetchImpl`, so the real `fetch` call never ran (BUG-03). A screen is not done until it has loaded real data in a real browser.
3. **An AC test must prove the AC, not the placeholder.** AC-M00-32 passed on `<Outlet/>` placeholders and the M00 quality score counted it (BUG-07).
4. **Wireframes are part of the spec** (`design/screen-inventory.md`). "Done" for a screen includes a side-by-side screenshot against its artboard; logic-only screens are partial work.
5. **Shared vocabularies need a contract test.** Web role labels drifted from backend role codes (BUG-04).
6. **Seed and import data must be read back.** Domain rules can turn a write into a silent no-op (BUG-06).
7. **Stateful dev containers need volumes** (BUG-05).
8. **One session per worktree.** Parallel sessions in one checkout break each other's gates and leak WIP into images (BUG-17).
