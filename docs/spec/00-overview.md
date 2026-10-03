# 00 · Implementation spec overview

Status: **Approved for build** · Owner: Senior system architect (orchestrator) · Source: [HLD Rev 1.0](../hld/HLD-Rev1.0.md), [Product review Rev 2.0](../requirements/Product-Review-Rev2.0.md), [screen inventory](../../design/screen-inventory.md), [wireframes](../../design/wireframes/)

This spec turns the HLD into buildable units. It is the single source of truth for the agents that write tests, backend code, frontend code and reviews. When the spec and the code disagree, the spec wins until an ADR changes it (see [§8](#8-change-control)).

| Doc | Contents |
|---|---|
| [00-overview](00-overview.md) | Scope, implementation architecture, repo layout, module roadmap, delivery workflow |
| [01-engineering-standards](01-engineering-standards.md) | SOLID, GoF pattern catalogue, clean code rules, testing standard, Definition of Done, quality score |
| [02-observability](02-observability.md) | Logging, tracing, metrics and debuggability with a bounded logging bill |
| [03-data-model](03-data-model.md) | Conceptual model for all modules, ownership, DDL conventions, RLS |
| [04-api-conventions](04-api-conventions.md) | REST conventions, errors, pagination, idempotency, auth, the full endpoint catalogue |
| [05-requirements-traceability](05-requirements-traceability.md) | Feature → module map, launch acceptance → proving modules, KPIs |
| [modules/](modules/) | One low-level design per module (classes, functions, DDL, OpenAPI, acceptance criteria) |

## 1. What we are building

The HLD's three cooperating products behind one edge:

```
 Agent PWA ─┐                      ┌─ CRM Port ──── Solo-CRM-lite (Core)  |  Twenty adapter (org tenants)
 Manager    ├─ Edge ─ BFF (scope   ├─ Content Port ─ Strapi adapter
 Console    │         guard) ──────┼─ Domain Core modules (12) ── Integration Hub ── insurers / vendors
 CRM web  ──┘                      └─ AI Port ───── AI Gateway (stub provider at launch, OD-3)
```

Build decisions that refine the HLD for implementation (each is an ADR in [`docs/adr/`](../adr/)):

| # | Decision | Rationale |
|---|---|---|
| I1 | BFF and Domain Core ship as **one NestJS process** (modular monolith) with the BFF as a thin `api/` layer per module. Module boundaries are enforced by lint rules, not by network hops. | HLD principle "pay for scale when it arrives"; modules can split later without data migration because they only talk through published interfaces and events. |
| I2 | Every module has four layers: `domain` (pure TS), `application` (use cases + ports), `infrastructure` (adapters), `api` (controllers, DTO schemas). Dependencies point inward only. | Clean architecture; Dependency Inversion; framework-free domain is unit-testable in milliseconds. |
| I3 | Each repository port has **two adapters**: in-memory (unit/component tests, local demo) and Postgres (runtime, integration tests). | Fast TDD loop; RLS and SQL are still proven by integration tests. |
| I4 | Twenty, Strapi and Keycloak are reached only through ports. Launch adapters: Solo-CRM-lite (Core-hosted CRM, HLD §10), HMAC dev token verifier + Keycloak JWKS verifier, Strapi REST client. | Lets the platform run and be tested end-to-end without those products; HLD D5/D6 swap-ability. |
| I5 | One React app (`apps/web`) hosts the Agent PWA (`/m/*`, phone layout), CRM web (`/crm/*`) and Manager/Admin Console (`/console/*`). | Shared design system, API client, i18n and telemetry; one bundle split per surface by route-level code splitting. |
| I6 | Validation with **zod** schemas shared between DTO parsing and OpenAPI generation. | One definition of each contract. |
| I7 | Money is integer paise (`bigint` in DB, `number` safe-integer in TS, never float). | HLD §8 rule. |

Out of scope for code (stays in infrastructure-as-code or vendor config): Terraform, cells, CDN/WAF, Keycloak realm config, Twenty Platform App packaging, Strapi plugin internals. Their contracts are specified where Core depends on them.

## 2. Tech stack

| Concern | Choice |
|---|---|
| Runtime | Node 22, TypeScript 5.8 strict |
| Core/BFF | NestJS 11 (DI container, HTTP), Express adapter |
| Persistence | PostgreSQL 16, `pg` driver, SQL migrations, Row-Level Security |
| Validation | zod |
| Logging | pino (JSON) wrapped by kernel `Logger` (see 02-observability) |
| Tests (core) | Jest + ts-jest, supertest for HTTP component tests, `*.int.spec.ts` against Postgres |
| Web | React 19, React Router 7, Vite 8 |
| Tests (web) | Vitest, Testing Library, jsdom; API mocked at the `ApiClient` port |
| Lint | ESLint 9 + typescript-eslint + sonarjs (complexity, cognitive complexity) |

## 3. Repository layout

```
apps/core/
  migrations/                 NNN_<module>.sql (expand → backfill → contract)
  src/
    main.ts, app.module.ts    composition root
    kernel/                   shared kernel (M00): observability, errors, tenancy context, persistence, outbox, audit, idempotency, http
    modules/<module>/
      domain/                 entities, value objects, domain services, domain events (no framework imports)
      application/            use-case services, ports (interfaces), DTO types
      infrastructure/         adapters: in-memory + pg repositories, external clients
      api/                    Nest controllers, zod request/response schemas
      <module>.module.ts      Nest wiring (composition only)
  test/                       component (HTTP) tests and integration tests, fixtures, builders
apps/web/src/
  app/                        router, providers, shells (MobileShell, ConsoleShell, CrmShell)
  design-system/              tokens + components from the screen inventory
  lib/                        api client, i18n, telemetry, formatting
  features/<module>/          api.ts, hooks, screens, components, *.test.tsx
design/                       wireframes (*.dc.html) and screen inventory — visual and behavioural spec
docs/spec, docs/adr, docs/quality
scripts/quality-report.mjs    module quality gate
```

## 4. Module roadmap

Modules are built in dependency order, one at a time. Each row links its LLD once written (LLDs are written just before the module starts, at full fidelity, so they reflect what earlier modules taught us).

| ID | Module (HLD §7) | Depends on | Backend scope | Screens (wireframe) |
|---|---|---|---|---|
| M00 | Kernel & observability | — | logger, request context, debug buffer, metrics, errors/Problem Details, Result, Money, clock, ids, tenant guard, UoW, outbox, audit, idempotency | Web shell, design system, API client, i18n, telemetry, state components |
| M01 | Tenant & Entitlements | M00 | tenant directory, host → tenant resolution, plans, limits, feature flags, tie-ups, brand kit | W07 Tenant setup, W09 Operator tenants |
| M02 | Distribution Network | M01 | branches/teams hierarchy, users & memberships, salesperson type, licences & expiry, roles/permissions | W02 Onboarding & hierarchy, W10 Users & roles |
| M03 | Party & Consent | M01 | party, contact points, household roles, consent ledger, suppression, dedup matcher | CRM04 Customers, CRM09 Customer record |
| M04 | CRM Engagement | M02, M03 | CRM Port (Solo-CRM-lite adapter + Twenty adapter contract), leads, routing engine, SLA, stages, tasks, activities, opportunities, dedup | CRM01, CRM02, CRM03, CRM05, CRM07, M02, M16, M17 |
| M05 | Product Catalogue & Comparison Scope | M01, M02 | insurers, product versions, eligibility, comparison scope engine (F78) | M08 Compare, W07 catalogue tab |
| M06 | Advice & Quote | M05 | needs calculators, quotes, benefit illustration ack, advice records | M06 Calculators, M09 Quote & BI |
| M07 | Book & Retention | M03, M05 | held policies, premium schedule, due engine, book import with review | M04 Due calendar, M05 Book import, M01 Today |
| M08 | Integration Hub | M00 | adapter SPI, capability manifest, circuit breaker, bulkhead, retry, DLQ | W12 Integrations |
| M09 | Proposal & Issuance | M06, M08 | proposal, frozen snapshot, submission saga, unknown state, reconcile, issuance | M10 Proposal, M11 Tracker, W16 Proposal desk |
| M10 | Commission & Performance | M09 | rate cards, expected/received, reconciliation, persistency | W05 Commission, M14 Income |
| M11 | Compliance & Audit | M00 | ad approval register, publish gate, audit query, DSR cases | W04 Compliance centre |
| M12 | Engagement Orchestration | M03, M07 | reminder schedules, send with consent recheck, Messaging Port | CRM06 Campaigns, M12 Message |
| M13 | Documents & AI Gateway | M03 | document store pointers, AV status, AI skill contract, stub provider | W06 AI controls |
| M14 | Content & White-label | M01, M11 | Content Port (Strapi), brand kit render, publish via approval | W08 White-label, W13 Content |

## 5. Delivery workflow (spec-driven TDD, one module at a time)

```
 Architect (orchestrator)            Test agent        Backend agent     Frontend agent     Review agent
 ── writes LLD + acceptance ──▶  writes failing  ──▶  makes tests  ─┐
    criteria (AC-Mxx-nn)          tests (RED)          pass (GREEN)  ├─▶  reviews diff vs spec,
                                                                     │    standards, observability;
                                  (API contract from LLD) ──▶ builds screens + tests ─┘   scores 0–10
 ◀── fixes findings (agents re-run) ◀──────────────────────────────────────────────────────┘
 ── runs scripts/quality-report.mjs → docs/quality/Mxx.md → commit + push
```

1. **Spec** — the architect writes `docs/spec/modules/Mxx-*.md`: purpose, domain model, class/function signatures, patterns used, DDL, OpenAPI, observability points, and numbered acceptance criteria `AC-Mxx-nn`.
2. **Red** — the test agent writes unit, component (HTTP) and integration tests from the spec only. Every test title or `describe` that proves a criterion carries its `AC-Mxx-nn` tag. Tests compile against the interfaces in the spec and fail.
3. **Green** — the backend agent implements until the tests pass, without editing tests (a suspected test bug is reported, not patched). Refactor while green.
4. **Screens** — the frontend agent builds the module's screens from the wireframes against the API contract, with component tests (rendering, states, interactions, i18n).
5. **Review** — the review agent checks spec conformance, SOLID/GoF usage, clean code, security/tenancy, observability and test quality; writes `docs/quality/Mxx.review.json` with a 0–10 score and findings.
6. **Fix & gate** — findings rated High or above are fixed before the gate; the quality report is generated and committed with the module.

Token discipline: agents receive the module LLD plus the standards docs, not the whole HLD; each module is closed (green, reviewed, scored, pushed) before the next starts.

## 6. Definition of Done (per module)

- All `AC-Mxx-nn` criteria have at least one test that references them; all tests pass.
- Coverage of the module: lines ≥ 85 %, branches ≥ 75 % (backend); lines ≥ 80 % (frontend).
- Zero lint errors; `tsc --noEmit` clean.
- No High/Critical review finding open.
- Observability points in the LLD are implemented (events, metrics, log fields) and asserted by at least one test.
- Tenant isolation test present for every new repository and endpoint.
- Quality report committed in `docs/quality/`.

## 7. Non-negotiable rules (from HLD and screen inventory)

Issued only on insurer confirmation · reconcile unknown submissions before retry with the same idempotency key · AI never fills declarations or quotes premiums · comparison scope from entity type and tie-ups · publish blocked without a valid approval reference · suppression rechecked at send time · tenant resolved from the verified domain, never from a caller-supplied ID · P3 data never leaves Core and never appears in logs.

## 8. Change control

A change to a published interface, table or event needs an ADR in `docs/adr/` and a spec update in the same commit. Agents that find a spec gap stop and report it; the architect resolves it in the spec.
