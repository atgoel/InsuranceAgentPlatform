# 01 · Engineering standards

Applies to every line in `apps/core` and `apps/web`. Reviewers score against this document.

## 1. SOLID, applied

| Principle | Rule in this codebase | Example |
|---|---|---|
| **S**ingle responsibility | A class has one reason to change. Use-case services orchestrate; domain entities enforce invariants; repositories persist; controllers translate HTTP. A service with more than ~7 public methods or more than 5 constructor dependencies is split. | `CreateLeadService` creates leads; routing lives in `LeadRouter`; dedup lives in `DuplicateMatcher`. |
| **O**pen/closed | New behaviour arrives as a new class behind an existing interface, not as a new `if` branch. Variation points are strategies, specifications or adapters registered in a map. | New routing method = new `RoutingStrategy`; new insurer = new adapter, no domain change. |
| **L**iskov substitution | Every adapter passes the same contract test suite as its siblings (in-memory and Postgres repositories share one `describe` factory). | `describeLeadRepositoryContract(makeRepo)` |
| **I**nterface segregation | Ports are small and named for the consumer's need (`LeadReader`, `LeadWriter`), not a god `LeadDao`. | `ConsentChecker` exposes `canContact(partyId, channel, purpose)` only. |
| **D**ependency inversion | `domain` and `application` import only interfaces. Concrete adapters are bound in `<module>.module.ts` with injection tokens (`Symbol`) declared next to the port. Lint enforces the layering. | `@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository` |

## 2. Gang-of-Four pattern catalogue

Patterns are used where they remove a conditional or a coupling, never decoratively. The LLD names the pattern next to each class that uses one.

| Pattern | Where | Why |
|---|---|---|
| **Strategy** | Lead routing methods (round-robin, territory, skill, load), needs calculators, commission rule types, retry/backoff policies | Swap algorithms by configuration (HLD "configuration is data") |
| **Specification** (DDD, composite of GoF Interpreter/Composite) | Lead eligibility, segment rules, comparison scope filters, stage entry rules | Business rules as composable, testable objects |
| **Adapter** | CRM Port (Solo-CRM-lite, Twenty), Content Port (Strapi), insurer adapters, messaging providers, token verifiers | HLD ports-and-adapters at every seam |
| **Factory / Factory Method** | Entity creation with invariants (`Lead.create`), adapter selection from capability manifest (`InsurerAdapterFactory`) | Single place that guarantees valid construction |
| **Builder** | Test data builders (`aLead().withSource('web').build()`), Problem Details, query builders | Readable tests; complex objects without telescoping constructors |
| **Template Method** | `BaseUseCase.execute()` wraps validation → authorise → run → audit/outbox → log; subclasses implement `run()` | Uniform cross-cutting behaviour without copying it |
| **Decorator** | Repository/adapter decorators for metrics and tracing (`TracedRepository`), circuit breaker and retry around insurer adapters, caching decorator for catalogue reads | Add cross-cutting behaviour without touching the decorated class |
| **Chain of Responsibility** | Dedup matching rules (exact phone → exact email → fuzzy name+DOB), HTTP request pipeline (Nest middleware/guards/interceptors), error-to-Problem mappers | Ordered, independently testable steps |
| **Observer** | Domain events → outbox → subscribers (projection to CRM, audit, reminders) | Modules react to each other without direct calls |
| **State** | Lead stage, opportunity, proposal submission (`Draft → Submitted → Unknown → Issued…`), DSR case | Legal transitions encoded once; illegal transitions are impossible |
| **Command** | Outbox messages, queued offline writes from the PWA, saga steps | Serialisable, replayable, idempotent units of work |
| **Facade** | Module public API (`PartyFacade`) consumed by other modules | One published interface per module; internals stay private |
| **Proxy** | Lazy/protected access to P3 fields (decrypt on read with purpose check) | Enforce privacy at the access point |
| **Composite** | Distribution hierarchy (branch → team → agent), segment rule trees | Uniform treatment of parts and wholes |
| **Singleton (via DI scope)** | Logger, metrics registry, clock — DI-managed singletons, never module-level mutable globals | Testable replacement |

## 3. Clean code rules

- **Names** reveal intent: `markPaidNotIssued()`, not `update2()`. Booleans read as predicates (`isSuppressed`). No abbreviations except domain terms (UIN, POSP, ISP, KYC, DPDP).
- **Functions** do one thing; ≤ 40 lines target (lint warns at 60), ≤ 4 parameters (use an options object beyond), cyclomatic complexity ≤ 10, cognitive complexity ≤ 15, nesting depth ≤ 3.
- **No magic values**: statuses are string-literal unions or enums; thresholds come from configuration objects with defaults in one file.
- **Errors**: throw typed `DomainError` subclasses (see M00) for business rule violations; never throw strings; never swallow an error without logging it at the right level once (log where handled, not where thrown).
- **Immutability**: value objects are immutable; entities expose intention-revealing methods, not setters. Use `readonly` everywhere possible.
- **Null handling**: return `undefined` for "not found" from repositories; use cases convert to `NotFoundError`. No `null` in domain types.
- **Comments** explain *why* (regulation, HLD reference, trade-off), never *what*. Reference HLD sections and feature IDs (`// F78: …`).
- **No `any`**, no non-null assertions in production code, no `console.*` (use the Logger).
- **Time and randomness** come from injected `Clock` and `IdGenerator` so tests are deterministic.
- **Money**: integer paise via the `Money` value object; formatting only at the edge.
- **Dead code** is deleted, not commented out.

## 4. Error model

`DomainError` (abstract, has `code`, `httpStatus`, `safeDetail`) → `ValidationError` 400 · `UnauthenticatedError` 401 · `ForbiddenError` 403 · `NotFoundError` 404 · `ConflictError` 409 · `BusinessRuleError` 422 · `DependencyUnavailableError` 503 · `UnknownOutcomeError` 202 (external call outcome unknown; reconcile). Unexpected errors map to 500 with no internal detail. All responses are RFC 9457 Problem Details with `traceId` (see 04-api-conventions).

## 5. Testing standard

| Level | Scope | Tooling | Speed budget |
|---|---|---|---|
| Unit | Domain entities, value objects, strategies, specifications, use-case services with in-memory adapters | Jest / Vitest | < 10 ms each |
| Contract | One shared suite per port, run against every adapter | Jest `describe` factory | — |
| Component (HTTP) | Controller + guard + pipes + use case + in-memory adapters via `Test.createTestingModule` and supertest | Jest + supertest | < 100 ms each |
| Integration | Postgres adapters, migrations, RLS isolation, outbox in-transaction | `*.int.spec.ts`, `DATABASE_URL` | run in CI with Postgres |
| UI component | Screens and components with mocked `ApiClient` | Vitest + Testing Library | < 200 ms each |

Rules:
- **TDD**: tests are written from the spec before the implementation. Test names state behaviour (`it('rejects a move to Won unless the insurer has confirmed issuance')`).
- **Traceability**: each acceptance criterion `AC-Mxx-nn` appears in at least one `describe`/`it` title.
- **AAA** layout (arrange, act, assert); one behaviour per test; builders for test data; no shared mutable fixtures between tests.
- **No mocking of what you own** in domain tests — use in-memory adapters. Mock only at process boundaries (HTTP clients, clock).
- **Tenant isolation** test for every repository and every endpoint (data created under tenant A is invisible to tenant B).
- **Observability assertions**: tests use the `MemoryLogSink` / `MetricsRegistry` test doubles to assert required events and metrics.
- UI tests query by role/label (accessibility-first), cover loading, empty, error (with trace reference), and permission-denied states.

## 6. Definition of Done

See [00-overview §6](00-overview.md#6-definition-of-done-per-module).

## 7. Quality score

`scripts/quality-report.mjs <module>` computes a 0–100 score per module:

| Component | Weight | Full marks when |
|---|---|---|
| Coverage | 35 | mean of line, branch and function coverage ≥ 90 % (linear below) |
| Lint & clean-code rules | 15 | zero errors and warnings (−3 per error, −0.5 per warning) |
| Type safety | 10 | `tsc --noEmit` passes in strict mode |
| Spec traceability | 15 | every `AC-Mxx-nn` is referenced by a test |
| Independent review | 25 | review agent score 10/10 (score × 2.5) |

Any failing test caps the score at 50. Grades: A ≥ 90, B ≥ 80, C ≥ 70, D below. The score, the coverage table and the review findings are published to `docs/quality/Mxx.md`, and the scoreboard to `docs/quality/README.md`.

### Review rubric (review agent, 0–10)

| Dimension | Weight |
|---|---|
| Spec conformance (API shapes, DDL, behaviour, ACs) | 3 |
| Design (SOLID, patterns as specified, layering) | 2 |
| Security & tenancy (tenant from trust, RLS, authz, P3 handling) | 2 |
| Observability (events, metrics, no PII in logs, trace IDs in errors) | 1.5 |
| Test quality (behavioural, edge cases, isolation tests) | 1.5 |

Findings are rated Critical / High / Medium / Low and recorded with status `open` or `fixed`.
