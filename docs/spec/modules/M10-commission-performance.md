# M10 · Commission & Performance — low-level design

M07 integration amendment (ADR-M07-cross-module-contracts, approved 2026-10-03): implement only the durable RECEIVED import ledger ahead of the remaining M10 work. Publish `COMMISSION_IMPORT_PORT` and `CommissionImportPort.recordReceived(tx, { heldPolicyId, insurerId?: string, sellerMemberId: string, amountPaise: number, ratePct?: number, reason?: string, invoiceNo?: string, occurredOn: string, importKey: string }): Promise<{ id: string; created: boolean }>`. `importKey` is stable batch+row; tenant+importKey is unique. Money is integer paise, rows append-only, with RLS and memory/PG adapters. Record `commission.received_recorded` as structured log/audit; this minimal slice has no outbox consumers (kernel outbox event names require three segments). Rates, expected commission, MIS, reconciliation and M10 screens remain future work.

Status: Ready for build · Depends on: M00–M02, M05, M07, M09 · Requirements: Rev 3.0 F25 (rate setup), F26 lite (expected/received with audited adjustments), F30 lite (export), F35 (sales MIS), F85 (income, persistency cohorts, targets); F27–F29 and F31 are **not** at launch (no statement auto-matching beyond exact reference, no payouts, no accounting) · HLD §7 (Commission & Performance) · Screens: W05 `CommissionSetup`, M14 `Income`, W09 `ManagerConsole` (MIS tiles)

## 1. Responsibilities
- **Rate cards** (F25): per insurer × product version (or product category fallback) × basis (FIRST_YEAR, RENEWAL by policy year) × premium-paying-term band, with effective dates, as published in the insurer's commission policy. Rates are data, never code; IRDAI caps are not hard-coded (insurer policies already comply) but a configurable sanity ceiling flags outliers.
- **Expected commission**: computed when a policy sale is issued (M09) and on each recorded renewal payment (M07), from the rate card effective on the premium date. Integer paise; rounding half-up to the paisa.
- **Received commission**: recorded manually or from a statement row with the insurer's reference; exact-reference matching only at launch; unmatched rows go to a queue.
- **Adjustments**: clawbacks (free-look cancellation, lapse within the clawback window per rate card), corrections — every adjustment audited with reason; nothing is ever edited in place.
- **Performance** (F85, F35): expected vs received by insurer/product/salesperson, persistency cohorts (13th/25th/37th/49th/61st month) from held-policy payment history, targets and progress.
- **Finance export** (F30 lite): CSV of sales and commission records for a period.

## 2. Module layout
```
apps/core/src/modules/commission/
  domain/
    rate-card.ts          RateCard, RateRule (Specification on {insurer, version, category, basis, policyYear, ppt}), RateResolver (most specific wins)
    commission-entry.ts   CommissionEntry (EXPECTED | RECEIVED | ADJUSTMENT), immutable ledger lines
    ledger.ts             CommissionLedger (per policy): balances, outstanding, clawback rules
    persistency.ts        PersistencyCalculator (cohorts by issue month; 13/25/37/49/61)
    targets.ts            Target, Progress
    events.ts
  application/ ports.ts, rate-card.service.ts, commission.service.ts, statement.service.ts, performance.service.ts, export.service.ts, subscribers.ts
  infrastructure/ in-memory + pg repositories
  api/ schemas.ts, rate-cards.controller.ts, commissions.controller.ts, performance.controller.ts
  commission.module.ts
apps/core/migrations/100_commission.sql
apps/web/src/features/commission/
```

## 3. Domain model
```ts
export type Basis = 'FIRST_YEAR' | 'RENEWAL';
export interface RateRule { id: string; insurerId: string; productVersionId?: string; category?: string; basis: Basis; policyYearFrom: number; policyYearTo: number; pptFrom?: number; pptTo?: number; ratePct: number /* 0..100, 2 dp */; effectiveFrom: string; effectiveTo?: string; clawbackMonths: number }
export class RateCard {
  constructor(rules: RateRule[])          // overlapping rules of equal specificity and effective range → ValidationError('rate_overlap')
  resolve(q: { insurerId; productVersionId?; category?; basis; policyYear; ppt?; on: string }): RateRule | undefined   // specificity: version > category > insurer-wide
}
export type EntryKind = 'EXPECTED' | 'RECEIVED' | 'ADJUSTMENT';
export interface CommissionEntry { id; policySaleId?; heldPolicyId; sellerMemberId; insurerId; kind: EntryKind; amountPaise: number /* signed for ADJUSTMENT */; premiumPaise?: number; rateRuleId?; ratePct?; basis?; policyYear?; insurerRef?; reason?; occurredOn: string; createdBy: string; createdAt: string }
export class CommissionLedger {
  constructor(entries: CommissionEntry[])
  expected(): number; received(): number; adjustments(): number; outstanding(): number   // expected + adjustments − received
  clawbackFor(cancelledOn: string, rule: RateRule, issuedOn: string): CommissionEntry | undefined   // within clawbackMonths → negative ADJUSTMENT of the first-year expected
}
export function expectedCommission(netPremiumPaise: number, ratePct: number): number   // base = premium WITHOUT GST (insurers pay commission on net premium); round half-up to paisa; integer math only (CR-001 §4)
export class PersistencyCalculator {
  cohortRate(policies: Array<{ issuedOn: string; paidInstallments: Array<{ dueDate: string; paidOn?: string }> }>, month: 13 | 25 | 37 | 49 | 61, asOf: string): { eligible: number; persisting: number; ratePct: number | null }
  // eligible = policies whose (issue + month) ≤ asOf; persisting = premium due at that month paid within grace; null when eligible = 0
}
```

## 4. Application services
| Service | Behaviour |
|---|---|
| `RateCardService` | upsert rules (operator for platform defaults; TENANT_ADMIN/FINANCE for tenant-negotiated cards), validate overlaps, sanity ceiling flag (`ratePct > 40` → warning in response, not an error); audit `commission.rate_card.changed` |
| `CommissionService` | subscribers: `proposal.policy.issued` → EXPECTED first-year entry; `book.policy.payment_recorded` → EXPECTED renewal entry for platform-sold policies; `book.policy.status_changed` to CANCELLED within free-look/clawback → ADJUSTMENT; manual RECEIVED entries; adjustments with reason (maker-checker later) |
| `StatementService` | upload statement rows `{ insurerRef, policyNumber, amountPaise, period }` → exact match by policy number hash + period → RECEIVED; others → unmatched queue with manual link action |
| `PerformanceService` | `income(principal, period)` → expected/received/outstanding by insurer and month (scoped: self, team, tenant); `persistency(principal, asOf)`; `mis(principal, period)` → leads, contact rate, quote→proposal, proposal→issued, issued premium, commission by source/product/insurer/salesperson (reads M04/M09 aggregates through their published read ports); targets progress |
| `ExportService` | CSV (UTF-8, ISO dates, paise as rupees with 2 dp in export only) of sales and commission entries for a period; audit `commission.export` |

## 5. API (`/api/v1`)
`GET/PUT /rate-cards` (`commission.rates.write` for PUT), `GET /commissions?policyId=&memberId=&period=` (`commission.read`, scoped), `POST ✱ /commissions/received`, `POST ✱ /commissions/adjustments` (`commission.write`, reason required), `POST ✱ /commission-statements` + `GET /commission-statements/{id}/unmatched` + `POST ✱ /…/unmatched/{rowId}/link`, `GET /performance/income?period=`, `GET /performance/persistency?asOf=`, `GET /performance/mis?period=`, `PUT /targets` (managers), `GET /exports/commissions.csv?from=&to=` (`commission.export`).
Permissions: sellers → `commission.read` (own), managers → team read + targets, `FINANCE → commission.*`, `TENANT_ADMIN → commission.*`.

## 6. DDL — `100_commission.sql`
`rate_rule` (tenant_id nullable = platform default; RLS policy allows tenant rows and platform rows read-only), `commission_entry` (append-only: INSERT/SELECT grants only), `commission_statement`, `commission_statement_row`, `sales_target`; RLS.

## 7. Observability
Events `commission.expected_recorded`, `commission.received_recorded`, `commission.adjusted`; metrics `commission_unmatched_rows_open` (gauge), `commission_entries_total{kind}`; export and adjustment actions audited with actor.

## 8. Frontend
W05 `CommissionSetupScreen` (rate rules table by insurer/product/basis/years, effective dates, overlap errors inline), M14 `IncomeScreen` (expected vs received cards, by insurer bars, outstanding list, persistency cohort tiles 13/25/37/49/61 with "—" when not yet eligible, targets progress), W09 manager MIS tiles.

## 9. Acceptance criteria
- **AC-M10-01** Rate resolution picks the most specific effective rule; overlaps rejected; boundary dates inclusive.
- **AC-M10-02** Expected commission is computed on premium without GST, in integer paise with half-up rounding; first-year on issuance and renewal on payment for platform-sold policies.
- **AC-M10-03** Ledger balances (expected, received, adjustments, outstanding); entries are never edited — corrections are adjustments with reasons.
- **AC-M10-04** Free-look/lapse within the clawback window creates exactly one negative adjustment.
- **AC-M10-05** Statement rows match exactly by policy and period; unmatched go to a queue and can be linked manually.
- **AC-M10-06** Persistency cohorts compute eligible/persisting/rate correctly with null when no policy is eligible.
- **AC-M10-07** Income and MIS respect record scope (self, team subtree, tenant); export audited and limited to the period.
- **AC-M10-08** Postgres: append-only commission entries; platform default rates visible read-only to tenants. *(integration)*
- **AC-M10-09** Commission setup and income screens as in §8.

## 11. CR-001 additions — commission base, invoice, register import

Source: [CR-001](../change-requests/CR-001-sales-register-fields.md). Built with M10.
- Commission base is the **net premium** (`commercials.premiumNetPaise`, without GST): `expectedCommission(netPremiumPaise, ratePct)`; `CommissionEntry.premiumPaise` is renamed `netPremiumPaise` and always holds the base used.
- RECEIVED entries gain `invoiceNo?: string` (1..40, the intermediary's GST invoice to the insurer) and `invoiceDate?: string` (YYYY-MM-DD); `POST /commissions/received` accepts both; DDL `commission_entry` adds `invoice_no text`, `invoice_date date`, `custom_fields jsonb not null default '{}'`, `custom_schema_version int not null default 1`.
- `CommissionImportPort.recordReceived(tx, { heldPolicyId, insurerId, sellerMemberId, amountPaise, ratePct?, reason?, invoiceNo?, occurredOn })` used by the M07 register import (CR-001 §3.4); one RECEIVED entry per imported row with a commission amount.
- MIS gains "business by referrer" and "business by source" (from `referred_by_name` / `business_source` of held policies and sales) and filters by reportable custom fields; P2 custom fields never appear in MIS or exports.
- **AC-CR001-03** (M10 part) Expected commission is computed on net premium (e.g. net ₹24,971, tax ₹4,495, gross ₹29,466 at 15 % → ₹3,745.65); a RECEIVED entry stores invoice number and date; an imported register row with Commission and Invoice No. creates one RECEIVED entry linked to the held policy.
