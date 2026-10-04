# M08 implementation hand-back

Date: 2026-10-04. User authorized review, handover update, commit and push.

## Contract and approved changes

The implemented contract is `docs/spec/modules/M08-integration-hub.md`. Decisions
1–13 and their later amendments were explicitly approved in this session;
`docs/adr/ADR-M08-integration-hub.md` and
`docs/adr/ADR-M08-contract-clarifications.md` list their scope. The simple option
adds bounded health storage, repository purge methods, a fixed sandbox runner,
an injected origin allowlist and state/lease compare-and-save. Future alternatives
remain Proposed in `docs/adr/ADR-M08-future-evolution.md:3`.

## Deviations, assumptions and open questions

| Kind | Item | Reference |
|---|---|---|
| LLD deviation | No intentional runtime contract deviation identified. Exact routes, signatures, statuses and error codes were reviewed against the consolidated LLD. | `docs/spec/modules/M08-integration-hub.md:259`, `docs/spec/modules/M08-integration-hub.md:438`, `docs/spec/modules/M08-integration-hub.md:507` |
| Process deviation | Tests were not consistently written before implementation. Negative-behavior mutations subsequently demonstrated failures; this does not establish the required original TDD order. | `docs/spec/01-engineering-standards.md:66`; `docs/quality/M08-domain-mutation-evidence.json:1`, `docs/quality/M08-job-mutation-evidence.json:1`, `docs/quality/M08-runtime-mutation-evidence.json:1` |
| Process limitation | Required Sonnet project agents were unavailable. Available agents followed backend, persistence, web and reviewer briefs; backend and web received cross-author review. | `AGENTS.md:48`; `docs/quality/M08.review.json:15` |
| Verification limitation | The 200 ms UI speed budget is not met by every case: the restored first screen case took 223 ms. It remains far below its timeout. Wall-clock speed budgets are not claimed for all unit/HTTP cases. | `docs/spec/01-engineering-standards.md:63`; `apps/web/src/features/integrations/screens/IntegrationsScreen.test.tsx:58`; `docs/quality/M08.ui-review-fixes.evidence.json:48` |
| Publication | The original no-commit restriction was superseded by the user's explicit request to commit and push after review. Quality artifacts are included in the M08 commit. | `docs/spec/00-overview.md:132`; `docs/quality/M08-handback.md:3` |
| Existing dependency limitation | The kernel memory unit of work does not roll back unexpected dependency failures. PostgreSQL supplies the production atomicity guarantee; callback/outbox rollback and restart are tested there. | `apps/core/src/kernel/persistence/in-memory-unit-of-work.ts:4`; `apps/core/test/integration/repositories.int.spec.ts:82` |
| Approved boundary | Default adapters are assisted and fake; credentials fail closed and the URL allowlist defaults empty. Real insurer adapters, credentials and permitted origins require deployment bindings. No real insurer integration is claimed. | `apps/core/src/modules/integration/integration.module.ts:99`, `apps/core/src/modules/integration/integration.module.ts:103`, `apps/core/src/modules/integration/integration.module.ts:113` |
| Approved boundary | Certification runs five checks against fixed sandbox doubles. Real insurer sandbox certification is deferred. | `docs/adr/ADR-M08-future-evolution.md:32`, `docs/adr/ADR-M08-future-evolution.md:53` |
| Approved boundary | Breakers are per process; persisted snapshots are informational. Shared admission across instances is deferred. | `docs/adr/ADR-M08-future-evolution.md:50` |
| Approved boundary | Probe, reconciliation and retention jobs are invocable. Deployment scheduler wiring is deferred. | `docs/adr/ADR-M08-future-evolution.md:51` |
| Approved boundary | Results and resend barriers are retained; only proposal/callback ciphertext and expiring payloads are purged at 180 elapsed days, and call logs at 90 days. Record purge and scalable maintenance extensions remain deferred. | `docs/spec/modules/M08-integration-hub.md:538`; `docs/adr/ADR-M08-future-evolution.md:31`, `docs/adr/ADR-M08-future-evolution.md:57` |
| Approved ownership | M09 owns payment eligibility, issuance validation and the unknown-age monitor. M08 never infers a sale/payment from status or resubmits an uncertain proposal. | `docs/spec/modules/M08-integration-hub.md:238`, `docs/spec/modules/M08-integration-hub.md:499` |
| Open approvals | None required for the implemented scope. Each Proposed future item requires its own later design and approval before implementation. | `docs/adr/ADR-M08-future-evolution.md:63` |

## Verification

Module quality verification: 152/152 backend tests and 26/26 frontend tests pass; both module lint checks report zero errors and warnings, and strict types pass. Backend coverage is 93.77% lines / 77.48% branches; frontend lines are 97.85%. All 11 ACs have behavioral test coverage. Generated score: 96.8 A, with reviewer score 8.7/10. Required final all-gate results follow below.
The PostgreSQL application restart journey uses the app role, persists encrypted
barriers and deduplication, reconciles the original version, and proves concurrent
HTTP status replay closes once (`apps/core/test/integration/boot.int.spec.ts`).
Mutation evidence records expected behavioral failures and restoration; temporary
mutation drivers are removed from the working tree.

Final required command: `node scripts/gate.mjs all` — exit 0.

| Check | Final result |
|---|---|
| Core strict types | PASS |
| Core lint | PASS, zero errors; one existing advice warning |
| Core tests | PASS, 2,105 / 2,105 |
| Web strict types | PASS |
| Web lint | PASS, zero errors; 17 existing warnings outside M08 |
| Web tests | PASS, 703 / 703 |
| PostgreSQL integration tests | PASS, 169 / 169 |

No behavior changed after this final all-gate. Publication review removed trailing blank lines and updated documentation to
record the results. No unresolved High/Critical review finding or new contract
question remains. Real insurer bindings and future alternatives are outside this
approved milestone, as listed above.
