# M07 cross-module contracts

Status: Approved by the user, 2026-10-03.

M07 is authorized with the following corrections to the published contracts.

1. Birthday month/day is necessary for birthday and insurance-age alerts. M03 derives an optional `birthday` (`MM-DD`) when a valid DOB is captured, alongside `dobYear`, and exposes both only through its internal PartySummary. M07 never decrypts DOB. Existing parties without this projection skip these alerts; no DOB backfill or inference occurs. Erasure removes the projection. Feb 29 anniversaries clamp to Feb 28 in non-leap years.
2. M04 publishes RenewalOpportunityPort.ensure(tx, input). A tenant+held-policy+renewal-date key is stored durably in the same transaction as the CRM opportunity; replay returns the existing opportunity. There is at most one open renewal opportunity per policy. New opportunities use DISCOVERY, the servicing member, gross expected premium and `Renewal — <productName>`.
3. M10's CommissionImportPort is implemented now as a minimal append-only RECEIVED ledger slice, with in-memory and Postgres adapters. M07 uses a stable batch+row import key for idempotency. No rate cards, commission calculations, MIS or M10 screens are included in this slice.
4. Unimplemented M09 is a future producer. M07 consumes an internal IssuedPolicyReader with an insurer-confirmed snapshot and deduplicates by policySaleId; production calls without a reader fail explicitly and retain the outbox event for retry, rather than inventing sale data. Component tests provide the reader to prove the consumer contract.

These decisions update M03, M04, M07 and M10 LLDs. The rest of M07, including the CR-001 register fields and screens, remains in scope.

M02 code-reference clarification: insurer_code is keyed by tenant+member+insurer, rather than an opaque row id. M07 stores `memberId:insurerId` as the internal composite reference only on an exact code+insurer match for the servicing member. Unknown/external codes remain text-only.
