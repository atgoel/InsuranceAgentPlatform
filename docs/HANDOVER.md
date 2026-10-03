# Handover

Read this first in every new session (see "Session protocol" in CLAUDE.md), then update it before ending.

## State (2026-10-03)
| Module | Status | Quality report |
|---|---|---|
| M00 Kernel, observability, web shell | done | docs/quality/M00.md — 94.2 A |
| M01 Tenant & entitlements | done; Postgres adapters done | M01.md — 88.4 B |
| M02 Distribution network | done; Postgres adapters **in progress** | M02.md — 96 A |
| M03 Party & consent | done; Postgres adapters **in progress** | M03.md — 94.2 A |
| M04 CRM (+ M04b Twenty sync) | done; Postgres adapters **in progress** | M04.md — 92 A |
| M05 Product catalogue | done; Postgres adapters done | M05.md — 98.8 A |
| M06–M14 | specs written in docs/spec/modules; **not started — do not start without the user's go-ahead** | — |
| CR-001 sales-register fields | docs/spec/change-requests/CR-001-sales-register-fields.md; Reference = referrer (customer-confirmed); **awaiting approval**; planned before M07 | — |

## Environment
- Windows workstation; Postgres via `docker compose -f infra/dev/docker-compose.yml up -d` (port 5433).
- Branch `claude/jolly-volta-k4kfdi`; commit messages end with the Co-Authored-By line.

## Conventions worth knowing
- Persistence is chosen per module by `KERNEL_OPTIONS.persistence` ('memory' | 'pg'); see `catalogue.module.ts` and `tenancy.module.ts` (`byPersistence()`) for the pattern; Pg adapter examples: `modules/tenancy/infrastructure/pg-tenancy.repositories.ts`, `modules/catalogue/infrastructure/pg-catalogue.repository.ts`.
- Tenant-scoped Pg repositories use the caller's RLS transaction (`isPgTransaction(tx)`); platform data uses the owner pool (PLATFORM_POOL).
- P3 personal data is encrypted with `kernel/crypto/aes-gcm-field-cipher.ts`.
- Agent output must be re-verified with the gate; past agents produced vacuous tests and false "done" claims.

## Next steps
1. Finish Postgres adapters for M02, M03, M04 and a full app boot with PERSISTENCE=pg.
2. Then stop and ask the user before M06.
