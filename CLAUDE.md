# Working agreement for agents

Read before writing code: `docs/spec/00-overview.md`, `docs/spec/01-engineering-standards.md`, `docs/spec/02-observability.md`, and the module LLD you were assigned in `docs/spec/modules/`.

- The module LLD is the contract. Exported names, signatures, routes, status codes and error codes must match it exactly. If the spec is ambiguous or wrong, stop and report — do not invent.
- Layout: `apps/core/src/kernel` (shared kernel), `apps/core/src/modules/<module>/{domain,application,infrastructure,api}`, tests next to code as `*.spec.ts` (unit) or under `apps/core/test/<module>/` (HTTP component `*.spec.ts`, Postgres `*.int.spec.ts`). Web: `apps/web/src/features/<module>/`, tests `*.test.tsx`.
- Tag tests with acceptance criteria IDs in `describe`/`it` titles, e.g. `it('AC-M04-03 routes a lead round-robin within the branch', …)`.
- No `console.*` — use the kernel `Logger`. No `any`. No float money. Inject `Clock` and `IdGenerator`.
- Tenant comes only from the verified request context, never from request bodies or params.
- Commands: `cd apps/core && npx jest <path>` · `npx eslint src test` · `npx tsc --noEmit -p tsconfig.json`; `cd apps/web && npx vitest run <path>` · `npx eslint src` · `npx tsc --noEmit -p tsconfig.json`.
- Postgres for integration tests: `DATABASE_URL=postgres://iap_app:iap@localhost:5432/iap` (app role, RLS enforced) and `MIGRATION_DATABASE_URL=postgres://iap_owner:iap@localhost:5432/iap` (owner, runs migrations). Start with `pg_ctlcluster 16 main start` if down.
- Do not commit or push; the orchestrator does.
