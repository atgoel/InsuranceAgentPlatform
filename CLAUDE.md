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

## Lessons from the M07 review (mandatory)
The M07 build had to be corrected after merge. Do not repeat these mistakes.

**Spec and decisions**
- Never write "approved by the user" unless the user approved that exact decision in this session. A decision you need but nobody approved goes into an ADR marked `Proposed`, and you stop and report it. Do not build on it.
- An ADR lists every decision it covers. Do not add further "approved" items to an LLD that the ADR does not list.
- Put a spec change in the section it changes (signature, state table, route table, AC). Do not add amendment banners at the top of a file. The sections must never contradict each other.
- Do not add routes, fields, error codes or exported names outside the LLD. If one is needed, propose it and stop.

**Code shape**
- One statement per line. Never pack a function onto one line or a few long lines to get under `max-lines-per-function` or `complexity`. Split the function instead. Never disable or loosen a lint rule.
- Match the surrounding module's style. Keep lines to about 140 characters, except SQL and long string literals.
- A clean lint result that you get by packing code counts as a false claim.

**State machines, money and dates**
- For every status value, decide what each job, list and alert does with it. Terminal or closed records are excluded from reminders, alerts, dues and renewals unless the LLD says otherwise.
- After each mutation (payment, renewal, status update), make the stored status agree with what the classifier would compute. For example, a payment that leaves arrears must not set `IN_FORCE`.
- Enforce every time window (grace, revival, renewal) on every write path, not only in the read-side classifier. Define each business constant once (e.g. `annualGraceDays`) and reuse it in both places.
- A status label must be true for its date. A future installment is never `DUE_TODAY`.
- Check each allowed transition against real-world cases, such as a claim during grace, before you finalize the table. Send any change to the orchestrator.

**Tests**
- Each business rule and each bug fix has a test that would fail on the wrong behaviour. Before you hand back, prove it once by temporarily reverting the fix.
- An AC tag must name the AC that the test actually proves. Do not tag a test only to raise traceability.
- A test that runs close to its timeout is a defect: shrink the fixture or report it.

**Migrations**
- Never write compatibility or back-fill migrations for your own uncommitted local drafts. Reset the dev DB with `docker compose -f infra/dev/docker-compose.yml down -v`, then `up -d`.
- Once a migration is committed, never edit it. Add a new one.

**Hand-back**
- Report every deviation from the LLD, every assumption and every rule you could not satisfy, with file and line. Do not inflate quality scores or describe partial work as done.

## Lessons from the demo-readiness review (mandatory)
Findings: `docs/quality/demo-readiness-findings.md`. Plan: `docs/plan/ui-parity-and-pwa-plan.md`.
- Entry points (`apps/core/src/main.ts`, `apps/web/src/main.tsx`) must run in a check: boot the built core and load the built web app in a real browser. Both had never run.
- Tests that inject fakes for platform APIs (`fetchImpl`, storage, timers) must have one test that uses the real default. A screen is not done until it loaded real data in a real browser.
- Wireframes are part of the spec (`design/screen-inventory.md`). A screen is done only with a side-by-side screenshot against its artboard. Logic-only screens are partial work; report them as partial.
- An AC test must fail when the AC is not met. Never satisfy an AC with a placeholder (`<Outlet/>`, "Console Shell" text).
- When web and backend share a vocabulary (roles, codes), add a test that ties the two together.
- Seed or import scripts read back what they wrote; domain rules can turn a write into a silent no-op.
- One session per git worktree. Never run gates or build images from a tree with another session's uncommitted work.

## Session protocol (token budget)
- One module (or one bounded task) per session. Start by reading `docs/HANDOVER.md`; end by updating it (state, last commit, next steps, open decisions) and committing. Do not re-read history that the handover already summarises.
- Delegate building to the project agents in `.claude/agents` (Sonnet): `backend-builder`, `web-builder`, `wiring` (mechanical, low effort), `module-reviewer` (writes the review JSON). Give each a precise brief: paths, the LLD sections, the pattern file to copy, the ACs.
- The orchestrator keeps the spec, money/state-machine design and the final verification, re-running the gate itself before accepting any agent claim.
- Read only the file sections you need; keep command output small (gate, `--silent`, `| tail`).

## Lessons from the Wave 2 retrospective (mandatory, `docs/quality/wave2-retro.md`)
- Readiness gate before building: for each screen, check that every field, route and decision it needs exists in the LLD. Send all gaps to the user in one decision round as Proposed ADRs. Build only when the gap list is empty.
- A session is one batch of at most 3 agent tasks that touch disjoint files. The plan names the batch. At the batch end, update the handover, commit and stop. Do not start new scope in the same session.
- Merge train: agents run targeted gates (`gate.mjs <target> <paths>`). The orchestrator merges the whole batch, then runs each full gate once. Run `int` only when Postgres code changed. Rerun only the failing files.
- Before full gates, stop external heavy processes. A test that fails only under load is logged as flaky, not chased in the same session.
- Every agent brief starts with: "run `npm ci` in the worktree; confirm `node_modules/vitest` or `node_modules/jest` exists".
- Agent hand-backs are at most about 15 lines: files changed, gate lines, deviations with file:line, revert-proof result.
- Orchestrator review: read `git diff --stat` and only the risky hunks (money, state, security, crypto). Look at screenshots only at batch end, at most 3.
- Shared files (`messages.*.ts`, `nav.ts`) get one owner per batch, or a final task, so that no task waits on another.
- Haiku only for exact text edits that make no verification claim.
