# UI parity, demo fixes and PWA: implementation plan

Status: approved for build (2026-10-04). The user approved decisions D1–D6 (§6) and ADR-008 on 2026-10-04. Findings and IDs: [`docs/quality/demo-readiness-findings.md`](../quality/demo-readiness-findings.md). PWA approach: [ADR-008](../adr/ADR-008-pwa-incremental.md) (Accepted). Session start instructions: §8.

## 1. Principles
- **The contract does not change.** Shells, routes and screens are already specified: M00 §13.7 (shells), each module LLD's frontend section, and the wireframes (`design/wireframes/*.dc.html`, `design/screen-inventory.md`), which are part of the spec. This plan builds what is specified. Anything a wireframe shows that needs an unbuilt module (AI, proposals, campaigns, voice) is a decision in §6 — do not invent.
- **Tokens already match.** `apps/web/src/design-system/theme.css` has the prototype colours, font and radii. Do not add a second palette; add layout components that use these tokens.
- **Prototype is the visual reference, not the code.** `screens.js` is generated inline-styled HTML. Read it (or open http://localhost:8081/#/<Artboard>) for layout, copy and order; build with design-system components and CSS files.
- **Done means seen.** Every screen package ends with a screenshot of the app next to its artboard for each relevant persona (see §5) in addition to the gate.
- **One package per session or agent, one worktree per session** (lesson 8). Packages in the same lane touch disjoint files.

## 2. Route → artboard map
| Route | Screen file (`apps/web/src/features/…`) | Artboard | Module |
|---|---|---|---|
| `/login` | `app/pages/LoginPage.tsx` | `Start` (persona cards, optional, D5) | M00 |
| `/m/today` | `crm/screens/TodayScreen.tsx` | `Main` | M04 (+M07 dues) |
| `/m/leads`, `/m/leads/:id` | `crm/screens/MobileLeadsScreen.tsx`, `MobileLeadScreen.tsx` | `LeadsPipeline`, `LeadDetail` | M04 |
| `/m/tasks` | `crm/screens/MyTasksScreen.tsx` | `MyTasks` | M04 |
| `/m/customers` | not built | `Customer360` | M03/M07 (D6) |
| `/m/book`, `/m/dues` | `book/screens/DueCalendarScreen.tsx` | `DueCalendar` | M07 |
| `/m/book/import` | `book/screens/BookImportScreen.tsx` | `BookImport` | M07 |
| `/m/servicing` | `book/screens/ServicingTrackerScreen.tsx` | (`Customer360` servicing tab) | M07 |
| `/m/calculators` | `advice/screens/CalculatorsScreen.tsx` | `Calculators` | M06 |
| `/m/compare` | `catalogue/screens/CompareScreen.tsx` | `NeedsCompare` | M05 |
| `/m/research` | `catalogue/screens/ResearchLibraryScreen.tsx` | `ResearchAssistant` | M05 |
| `/m/me`, `/m/me/plan` | `tenancy/screens/SoloPlanScreen.tsx` | `Income` (later), `SoloPlan` | M01 |
| `/crm/leads`, `/crm/leads/:id` | `crm/screens/LeadsWorkspaceScreen.tsx`, `LeadRecordScreen.tsx` | `CRMLeads`, `CRMLeadDetail` | M04 |
| `/crm/pipeline` | `crm/screens/PipelineScreen.tsx` | `CRMPipeline` | M04 |
| `/crm/tasks` | `crm/screens/TasksScreen.tsx` | `CRMTasks` | M04 |
| `/crm/customers`, `/:id` | `party/screens/CustomersScreen.tsx`, `CustomerRecordScreen.tsx` | `CRMCustomers`, `CRMCustomerRecord` | M03 |
| `/crm/routing` | `crm/screens/RoutingRulesScreen.tsx` | `CRMAssignment` | M04 |
| `/crm/import`, `/import/duplicates` | `crm/screens/LeadImportScreen.tsx`, `party/screens/DuplicateQueueScreen.tsx` | `CRMImportDedup` | M04/M03 |
| `/crm/opportunities/:id/quote`, `/crm/advice/:id` | `advice/screens/QuoteWorkspaceScreen.tsx`, `AdviceRecordScreen.tsx` | `QuoteBI` | M06 |
| `/console/tenant`, `/brand`, `/custom-fields` | `tenancy/screens/TenantSetupScreen.tsx`, `BrandKitScreen.tsx`, `CustomFieldsScreen.tsx` | `TenantSetup`, `WhiteLabel`, `Configuration` | M01 |
| `/console/onboarding`, `/users-roles` | `distribution/screens/OnboardingHierarchyScreen.tsx`, `UsersRolesScreen.tsx` | `OnboardingHierarchy`, `UsersRoles` | M02 |
| `/console/integrations` | `integrations/screens/IntegrationsScreen.tsx` | `Integrations` | M08 (owned by the M08 session) |
| `/console/ops/tenants` | `tenancy/screens/OperatorTenantsScreen.tsx` | `OperatorTenants` | M01 |
| `/signup` | `tenancy/screens/SoloSignupScreen.tsx` | `SoloSignup` | M01 |

## 3. Work packages
Each package is a self-contained brief: give the agent the package text, CLAUDE.md, the listed spec sections and artboards. Sizes: S ≤ 2 h, M ≤ ½ day, L ≤ 1 day.

### Lane A — foundation (A1 blocks lane B; A2, A3, A4 in parallel)
**WP-A1 Page frame and form controls** · web-builder · M · no dependency · **lane B starts when A1 is merged**
- Build in `design-system/` (exported from `design-system/index.ts`) with exactly these props, so lane B can code against them:
```ts
export function PageContainer(p: { width?: 'default' | 'wide'; children: ReactNode }): JSX.Element      // ground bg; max 1280 (wide: 1600); padding 24 px, 32 px ≥ 1024 px
export function PageHeader(p: { title: string; subtitle?: string; actions?: ReactNode; back?: { to: string; label: string } }): JSX.Element
export function KpiRow(p: { children: ReactNode }): JSX.Element                                      // responsive grid, 1–4 columns
export function KpiTile(p: { label: string; value: ReactNode; caption?: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad' }): JSX.Element
export function Select(p: { label: string; value: string; options: { value: string; label: string }[]; onChange(value: string): void; hideLabel?: boolean; id?: string }): JSX.Element
export function DateInput(p: { label: string; value: string /*YYYY-MM-DD*/; onChange(value: string): void; min?: string; max?: string; hideLabel?: boolean }): JSX.Element
export function MonthInput(p: { label: string; value: string /*YYYY-MM*/; onChange(value: string): void; hideLabel?: boolean }): JSX.Element
export function SearchField(p: { label: string; value: string; onChange(value: string): void; placeholder?: string }): JSX.Element
export function CountChips(p: { options: { id: string; label: string; count?: number }[]; selected: string; onChange(id: string): void; ariaLabel: string }): JSX.Element  // single-select, aria-pressed
export function formatIstDate(isoDate: string, lang: 'en' | 'hi'): string     // "4 Oct 2026"; date-only values never show a time (BUG-16)
```
- Set `body { background: var(--ground); color: var(--ink); font-family: var(--font-sans) }` in `theme.css`. Do not change existing tokens.
- Tests: props contracts and accessibility (label association, `aria-pressed`, keyboard) in the style of AC-M00-31.
- No screen changes in this package.

**WP-A2 Shells and navigation** · web-builder · L · after A1 · fixes BUG-07, BUG-08, UI-01
- Build `app/shells/MobileShell.tsx`, `CrmShell.tsx`, `ConsoleShell.tsx` exactly per M00 §13.7: phone frame 390 × 844 on wide screens and full screen on narrow; app bar (tenant brand from `GET /api/v1/tenant` display name, EN/हि switch, avatar menu with the user's name and **Sign out** → `signOut()`); bottom nav Today, Leads, Customers, Book, Me; CRM/Console sidebar with the §13.7 sections, collapsible, search box filtering the nav, tenant name and role line, Sign out.
- Navigation entries are filtered by the signed-in user's permissions (`GET /api/v1/me`); entries whose screen is not built stay visible with a "Coming soon" badge and open the `EmptyState` (D3, M00 §13.7). Nav config lives in one file, `app/shells/nav.ts`: `{ section, labelKey, to, permission?, built: boolean }[]`.
- **A2 owns `app/routes.tsx`** (no other package edits it): replace the `<Outlet/>` and "Console Shell" placeholders; add `/m/customers` and `/m/customers/:id` → `CustomersScreen`/`CustomerRecordScreen` inside `MobileShell` (D6).
- Remove the EN/हि switch from `TodayScreen` only if it duplicates the shell switch (screens must not render their own; B packages remove any others in their files).
- Write the real AC-M00-32 tests (nav destinations, language switch, collapse and search filter, "Coming soon" entries, permission filtering, sign-out calls `signOut`). Prove they fail with the placeholders restored.

**WP-A3 Code labels** · web-builder · S · no dependency · fixes BUG-09 (catalogue only)
- One label catalogue in i18n for product category, line, lead source, lead stage, opportunity stage, policy status, role, record scope, servicing type; codes taken from the LLD enums only. Helper `useLabel(kind: LabelKind, code: string): string` in `lib/i18n/labels.ts`; unknown code → the code itself plus a `logger`-free dev warning in tests.
- **A3 does not edit screens.** Each lane-B package replaces raw codes in its own screens with `useLabel` (file ownership, §8).

**WP-A4 Visual check script** · backend-builder · S · no dependency · needs D1
- `scripts/ui-sweep.mjs`: signs in each persona through Keycloak, visits each route in §2, records API errors, "Something went wrong", "Coming in a later module", "Access Denied", and saves app and artboard screenshots side by side to `reports/ui/<date>/index.html`. Uses `playwright-core` with the installed Chrome (D1: dev dependency or scratch install).

### Lane B — screen parity (parallel after A1 is merged; one session per package; disjoint files, §8.2)
For every package: match the artboard's layout, copy order, states (loading, empty, error, permission) and interactions that the LLD covers; use A1 components and A3 labels; keep existing tests green and add tests for new behaviour; finish with the §5 screenshot check.

| WP | Scope (routes) | Artboards | Notes | Size |
|---|---|---|---|---|
| WP-B1 | `/m/today`, `/m/leads`, `/m/leads/:id`, `/m/tasks` | `Main`, `LeadsPipeline`, `LeadDetail`, `MyTasks` | Today: date line, greeting with name, KPI tiles, search, quick actions, dues card (UI-04, BUG-16). Items needing unbuilt modules per D4 | L |
| WP-B2 | `/m/book`, `/m/dues`, `/m/book/import`, `/m/servicing` | `DueCalendar`, `BookImport` | Month grid with urgency colours and amounts (UI-08); BUG-12 | L |
| WP-B3 | `/crm/leads`, `/crm/leads/:id`, `/crm/pipeline`, `/crm/tasks` | `CRMLeads`, `CRMLeadDetail`, `CRMPipeline`, `CRMTasks` | Kanban board (UI-06), search/owner filter (UI-05) | L |
| WP-B4 | `/crm/customers`, `/:id` (also shown at `/m/customers`, D6: must work at phone width), `/crm/routing`, `/crm/import`, `/import/duplicates` | `CRMCustomers`, `CRMCustomerRecord`, `CRMAssignment`, `CRMImportDedup` | BUG-11 | M |
| WP-B5 | `/m/calculators`, `/m/compare`, `/m/research`, quote and advice routes | `Calculators`, `NeedsCompare`, `ResearchAssistant`, `QuoteBI` | | M |
| WP-B6 | `/console/tenant`, `/brand`, `/custom-fields`, `/onboarding`, `/users-roles`, `/ops/tenants` | `TenantSetup`, `WhiteLabel`, `Configuration`, `OnboardingHierarchy`, `UsersRoles`, `OperatorTenants` | UI-07, BUG-14. Integrations stays with the M08 session | M |
| WP-B7 | `/login` | `Start` | Hero layout; persona dropdown kept (D5) | S |

Bug ownership inside lane B (the package that owns the screen file fixes the web side): BUG-10 lead tab counts → B3 (`LeadsWorkspaceScreen`) and B1 (`MobileLeadsScreen`); BUG-11 customers 0 → B4; BUG-12 servicing empty → B2; BUG-14 i18n key → B6; BUG-16 dates → every package via `formatIstDate`.

### Lane C — data and API bugs (parallel with lanes A and B)
**WP-C1 API side of the wrong counts** · backend-builder · S · `apps/core` only
- For BUG-10, BUG-11 and BUG-12, call the API as the seeded personas and compare with the LLD: lead counts/facets, `GET /parties` (or the customers list route in M03) scope for a SALESPERSON, `GET /servicing-requests` default filter. If the API is wrong, fix it with a failing test first. If the API is right, write the finding (route, response, expected rendering) into the findings file for the owning B package. Never edit `apps/web`.

**WP-C2 Demo data** · backend-builder · S
- `scripts/demo-seed.mjs`: set the distributor entity name through the existing tenant API (BUG-13); add opportunities across stages, one advice record with a shared quote, one duplicate pair for the dedup queue, and `scripts/demo-leads.csv` for the import demo. Read every write back (lesson 6).

### Lane D — PWA (ADR-008 Accepted; see §4)
**WP-D1 PWA foundation** · web-builder · M · after A2
- Manifest (name, short name, icons 192/512/maskable from the tenant brand default, `theme_color #1f5fbf`, `start_url /m/today`, `display standalone`), Apple touch meta, service worker that precaches the app shell only (no API responses), update-available toast, install prompt in the app bar menu. Library choice per ADR-008.

**WP-D2 Phone access over HTTPS** · backend-builder (infra) · M
- Optional compose profile `phone`: a TLS reverse proxy (Caddy with a local CA, or a tunnel) in front of web and Keycloak; parameterise `KC_HOSTNAME`, the `iap-web` redirect URIs and `DEV_TENANTS` host from one env var; document trusting the CA on a phone.

**WP-D3+ Per-module offline** · with each module
- Each module's LLD frontend section gains a short "Offline" line (what is cached, where, cleared on sign-out, queued writes) and its screens implement it. Today already does (AC-M04-29); the next candidates are leads list (read), dues (read) and activity logging (queued write).

### Lane E — process (orchestrator, S each)
- **WP-E1** Boot smoke in the gate: build core and run `node dist/main.js` against the test config until `/health/live` answers; build web and load `/login` in headless Chrome (BUG-01–03, lessons 1–2).
- **WP-E2** One git worktree per session (`git worktree add ../IMF-<task> -b <branch>`); Docker images built from a clean checkout of the branch under test (BUG-17).

## 4. PWA: when to build it
| Option | Effort | Risk | Verdict |
|---|---|---|---|
| Separate future module, built after the feature modules | Retro-fit offline rules, caching and HTTPS onto every screen at the end; PII caching decisions made late | High: OIDC, HTTPS and storage issues found last; rework across all screens | No |
| Parallel track now (full offline for every screen) | A second team touching the same shells and screens as lane B | Merge conflicts on shells and routes; offline rules designed without the module's data rules | No |
| **Incremental: a small foundation now, offline per module as it is built** | WP-D1 + WP-D2 once (≈ 1 day), then a few hours per module | Low: each module decides its own cacheable data with its LLD | **Recommended** |

Reasons: installability and the app-shell cache are one-off and live in files the shells package already touches (`index.html`, `main.tsx`, `vite.config.ts`), so they are cheapest right after WP-A2. Offline behaviour is a per-screen data rule (what personal data may sit on a phone), so it belongs in each module's LLD and build, exactly as Today did. HTTPS for phones is needed early because it is the only way to test sign-in and install on a real device.

## 5. Verification for every package
1. `node scripts/gate.mjs web` (and `core` if touched) — all PASS, no new lint warnings.
2. Rebuild the stack: `docker compose -f infra/dev/docker-compose.yml --profile app up -d --build web core`.
3. Run the visual check (WP-A4, or the scratch script until it exists) for the package's routes and personas; attach the side-by-side screenshots to the hand-back.
4. Orchestrator re-runs 1–3 before accepting (CLAUDE.md).

## 6. Decisions (all approved by the user on 2026-10-04)
| ID | Decision | Recorded in |
|---|---|---|
| D1 | `playwright-core` is a root dev dependency for `scripts/ui-sweep.mjs` (uses the installed Chrome; no browser download) | WP-A4 |
| D2 | ADR-008 incremental PWA is Accepted | ADR-008 |
| D3 | Sidebar entries for unbuilt modules stay visible with a "Coming soon" badge and open the "later module" `EmptyState`; entries without permission are hidden | M00 §13.7 |
| D4 | Today hides wireframe items owned by unbuilt modules (Scan policy, Ask AI, voice log, "Proposals pending", setup progress) | M04 §frontend `/m/today` row |
| D5 | Login uses the `Start` artboard layout (dark hero band, pitch, sign-in panel); the persona choice stays a dropdown, as the user asked earlier the same day | M00 §13.7 `LoginPage`, WP-B7 |
| D6 | `/m/customers` and `/m/customers/:id` reuse `CustomersScreen`/`CustomerRecordScreen` inside `MobileShell` | M00 §13.7, WP-A2 |

## 7. Order
1. **Baseline commit** of this session's work (Keycloak sign-in, fixes, plan) on `claude/jolly-volta-k4kfdi` — every session branches from it. The M08 session's uncommitted files are not part of it.
2. **Wave 1 (parallel):** WP-A1, WP-A3, WP-A4, WP-C1, WP-C2, WP-E1. A1 is the critical path: merge it first.
3. **Wave 2 (parallel, after A1 is merged):** WP-A2, WP-B1, WP-B3 (demo path), then WP-B2, WP-B4, WP-B5, WP-B6. B screens render inside the old placeholders until A2 merges; that is fine.
4. **Wave 3:** WP-B7, WP-D1 (after A2), WP-D2, WP-E2.

## 8. Starting a package in a new session
### 8.1 One-time setup per session (orchestrator or the session itself)
```
git -C C:/Workspace/IMF worktree add ../IMF-<wp> -b ui/<wp> claude/jolly-volta-k4kfdi
cd ../IMF-<wp> && npm ci
```
- The Docker stack (Postgres, Keycloak, core, web on :8080) runs **once**, from the main checkout; sessions do not start their own stack. Each web session runs Vite on its own port against it: `VITE_OIDC_AUTHORITY=http://localhost:8180/realms/iap VITE_OIDC_CLIENT_ID=iap-web VITE_DEMO_LOGIN=1 npx vite --port <port> --strictPort` (in `apps/web`). Keycloak accepts redirects on ports 5173–5179.
- Port per package: A1 5173 · A2 5174 · B1 5175 · B3 5176 · B2 5177 · B4 5178 · B5/B6 5179 (run one at a time).
- Backend sessions (C1, C2) use the running core on :3000 and the dev DB; they never reset the DB (`down -v` needs the user's approval).
- Gates run in the session's own worktree (`node scripts/gate.mjs web|core`); integration tests share the dev DB, so run `int` one session at a time.

### 8.2 File ownership (to keep merges clean)
| Package | Owns | Must not edit |
|---|---|---|
| A1 | `design-system/*` new files, `design-system/index.ts`, `theme.css` | screens, routes |
| A2 | `app/routes.tsx`, `app/shells/*`, `app/App.tsx`, `lib/auth/*` | screens except removing a duplicate language switch in `TodayScreen` |
| A3 | `lib/i18n/labels.ts`, label keys in `messages.*.ts` | screens |
| A4 | `scripts/ui-sweep.mjs`, root `package.json` dev dependency | apps |
| B1–B7 | the screen files and their `*.css`/tests listed in §2 for their routes, plus feature-local hooks/components | design-system, routes, other features' screens |
| C1 | `apps/core/**` for the three bugs | `apps/web` |
| C2 | `scripts/demo-seed.mjs`, `scripts/demo-leads.csv` | apps |
- i18n: every package adds keys only in its own module's block of `messages.en.ts`/`messages.hi.ts` (EN and HI together); the orchestrator resolves append conflicts at merge.
- A package that needs a change in a file it does not own stops and reports it (CLAUDE.md).

### 8.3 Kick-off prompt (copy into a new session)
```
You are building <WP-ID> from docs/plan/ui-parity-and-pwa-plan.md in worktree ../IMF-<wp> (branch ui/<wp>).
Read first: CLAUDE.md, docs/HANDOVER.md (section "Demo readiness and UI parity"), the plan §1, §2, §3 (<WP-ID> only), §5, §8,
docs/quality/demo-readiness-findings.md (the IDs your package fixes), the spec sections the package names, and the artboards
(open http://localhost:8081/#/<Artboard> or design/wireframes/<Artboard>.dc.html).
Delegate building to the project agents (.claude/agents) with a precise brief; re-run the gate yourself.
Done = gate green + side-by-side screenshots for your routes (§5) + a hand-back listing deviations with file:line.
Do not commit or push; do not edit files outside your ownership (§8.2); report anything that needs a spec change and stop.
```
