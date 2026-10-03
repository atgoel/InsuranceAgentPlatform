# Working agreement for agents

Read before writing code: `docs/spec/00-overview.md`, `docs/spec/01-engineering-standards.md`, `docs/spec/02-observability.md`, and the module LLD you were assigned in `docs/spec/modules/`.

- The module LLD is the contract. Exported names, signatures, routes, status codes and error codes must match it exactly. If the spec is ambiguous or wrong, stop and report — do not invent.
- Layout: `apps/core/src/kernel` (shared kernel), `apps/core/src/modules/<module>/{domain,application,infrastructure,api}`, tests next to code as `*.spec.ts` (unit) or under `apps/core/test/<module>/` (HTTP component `*.spec.ts`, Postgres `*.int.spec.ts`). Web: `apps/web/src/features/<module>/`, tests `*.test.tsx`.
- Tag tests with acceptance criteria IDs in `describe`/`it` titles, e.g. `it('AC-M04-03 routes a lead round-robin within the branch', …)`.
- No `console.*` — use the kernel `Logger`. No `any`. No float money. Inject `Clock` and `IdGenerator`.
- Tenant comes only from the verified request context, never from request bodies or params.
- Checks: use the quiet gate — `node scripts/gate.mjs core|web|int|all [paths] [--tests-only]` prints one line per step and only the failures. Use raw `npx jest` / `npx vitest` only when debugging a single test.
- Postgres for integration tests: `docker compose -f infra/dev/docker-compose.yml up -d` (port 5433, roles created by `infra/dev/init-roles.sql`). The gate defaults to `DATABASE_URL=postgres://iap_app:iap@localhost:5433/iap` (app role, RLS enforced) and `MIGRATION_DATABASE_URL=postgres://iap_owner:iap@localhost:5433/iap` (owner, runs migrations); set both env vars to override (e.g. a Linux sandbox on 5432).
- Dates: business dates are IST calendar dates — use `kernel/domain/ist.ts`, never `setHours`/`getDate` (they follow the server timezone).
- Do not commit or push; the orchestrator does.

## Session protocol (token budget)
- One module (or one bounded task) per session. Start by reading `docs/HANDOVER.md`; end by updating it (state, last commit, next steps, open decisions) and committing. Do not re-read history that the handover already summarises.
- Delegate building to the project agents in `.claude/agents` (Sonnet): `backend-builder`, `web-builder`, `wiring` (mechanical, low effort), `module-reviewer` (writes the review JSON). Give each a precise brief: paths, the LLD sections, the pattern file to copy, the ACs.
- The orchestrator keeps the spec, money/state-machine design and the final verification, re-running the gate itself before accepting any agent claim.
- Read only the file sections you need; keep command output small (gate, `--silent`, `| tail`).
