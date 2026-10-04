# M07 · Book & Retention — low-level design

Amended 2026-10-04 per [ADR-M07-cross-module-contracts](../../adr/ADR-M07-cross-module-contracts.md); changes are folded into the sections below.

Status: Ready for build · Depends on: M00–M05 · Requirements: Rev 3.0 F09 (held policies/dues on Customer 360), F20 (a sale creates a held policy), F21 (renewal opportunities), F71, F72, F73, F74; §6 data model ("Held policy", "Premium schedule") · HLD §7 (Book & Retention), §8 (insurer policy system stays authoritative; imported data labelled with source and as-of date) · Screens: M04 `DueCalendar`, M05 `BookImport`, M01 `Main` (Today — dues), CRM09 customer record "Policies" tab, `ServicingTracker` (W-lite)

## 1. Responsibilities

- **Held policies** — the agent's book, whether sold on the platform or elsewhere: insurer, product (catalogue link when known), policy number, sum assured, premium and mode, dates, status, roles (proposer/insured/payer via M03 role links), **source** (IMPORT, AI_EXTRACTED, MANUAL, PLATFORM_SALE), **as-of date** and **confidence**.
- **Premium schedule & due engine** (F72): life modes with grace periods, lapse and revival windows; general/health renewal dates; a daily due list.
- **Lifecycle alerts** (F73): maturity, survival benefit, anniversary, free-look end, age change, birthday.
- **Book import with review** (F71): CSV templates and insurer-portal exports; mapping, validation, dedup against the existing book, review queue before anything is written; PDF/photo extraction arrives through M13 (AI) as review items.
- **Servicing tracker lite** (F74): log a request with insurer reference, status, follow-up date and portal link; claims notes.
- **Renewal opportunities** (F21): general/health policies nearing expiry create M04 opportunities.

The insurer remains the system of record: nothing here is presented as authoritative status; every view shows source and as-of date.

## 2. Module layout
```
apps/core/src/modules/book/
  domain/
    held-policy.ts           HeldPolicy aggregate, PolicyStatus (State), PolicySource
    premium-schedule.ts      PremiumMode, Installment, PremiumSchedule (generator), GracePolicy
    due-engine.ts            DueStatus, DueEngine (pure: classify installments on a date)
    lifecycle-alerts.ts      LifecycleAlertRule (Strategy) × 6, LifecycleAlertEngine
    book-import.ts           ImportBatch, ImportRow, ColumnMapping, RowValidator (Chain), BookMatcher
    servicing.ts             ServicingRequest aggregate (State)
    events.ts
  application/
    ports.ts, book-context.ts
    held-policy.service.ts, due.service.ts, lifecycle.service.ts, book-import.service.ts, servicing.service.ts
    renewal-opportunity.job.ts, due-contributor.ts (MyWorkContributor for M04)
    subscribers.ts           (policy sale → held policy; party merged → relink)
  infrastructure/ in-memory-book.repositories.ts, pg-book.repositories.ts
  api/ schemas.ts, held-policies.controller.ts, dues.controller.ts, book-imports.controller.ts, servicing.controller.ts
  book.module.ts
apps/core/migrations/070_book.sql
apps/web/src/features/book/
```

## 3. Domain model

### 3.1 Held policy
```ts
export type PolicySource = 'IMPORT' | 'AI_EXTRACTED' | 'MANUAL' | 'PLATFORM_SALE';
export type PolicyStatus = 'IN_FORCE' | 'GRACE' | 'LAPSED' | 'PAID_UP' | 'MATURED' | 'SURRENDERED' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED';
export type PremiumMode = 'ANNUAL' | 'HALF_YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'SINGLE';
export interface HeldPolicyProps {
  id: string; line: 'LIFE' | 'HEALTH' | 'GENERAL'; insurerId?: string; insurerName: string; productVersionId?: string; productName: string;
  policyNumberEnc: string; policyNumberHash: string; policyNumberLast4: string;     // P2: encrypted + lookup hash (M03 FieldCipher)
  sumAssuredPaise?: number; premiumPaise: number; mode: PremiumMode;
  commencementDate: string; nextDueDate?: string; maturityDate?: string; premiumPayingTermYears?: number; policyTermYears?: number;
  renewalDate?: string;                         // HEALTH/GENERAL annual contracts
  status: PolicyStatus; statusAsOf: string;     // last known, from source
  source: PolicySource; sourceRef?: string; asOf: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  servicingMemberId?: string; orgUnitId?: string;                     // record scope (M02)
  distanceSale?: boolean;                       // §3.3 free-look condition; default false, never inferred from a marketing channel
  proposerPartyId: string;                                             // roles beyond proposer via M03 role links (HELD_POLICY subject)
  saleRef?: { policySaleId: string; opportunityId?: string };          // PLATFORM_SALE only
  createdAt: string; updatedAt: string; version: number;
}
export class HeldPolicy {
  static register(input): HeldPolicy        // validates dates (commencement ≤ maturity), premium ≥ 0, mode/line compatibility (HEALTH/GENERAL → ANNUAL or SINGLE)
  recordPayment(installmentDue: string, paidOn: string, now: Date): void   // pays the next unpaid due only; advances nextDueDate (LIFE) or renewalDate (annual) by mode
  updateStatusFromSource(status: PolicyStatus, asOf: string, source: PolicySource): void   // never overwrites a newer asOf
  renew(newRenewalDate: string, premiumPaise: number, now: Date): void       // HEALTH/GENERAL
  assignServicing(memberId: string, orgUnitId: string): void
  restore / markSaved / props
}
```
Allowed status changes (State): IN_FORCE ↔ GRACE → LAPSED → IN_FORCE (revival) | PAID_UP; IN_FORCE → MATURED | SURRENDERED | CLAIMED | EXPIRED | CANCELLED; GRACE → SURRENDERED | CLAIMED; PAID_UP → MATURED | SURRENDERED | CLAIMED; terminal states accept only `updateStatusFromSource` with a newer `asOf`.

Payment rules:
- PAID_UP and terminal policies reject payments and renewals (`policy_closed`) until a newer source status reopens them; SINGLE mode rejects payments (`installment_not_due`).
- LIFE: a payment later than due + `revivalYears` → `revival_window_expired`. After payment the status is IN_FORCE when the new next due is today or later; if it is still overdue (arrears remain) the status is GRACE within its grace period, otherwise LAPSED.
- HEALTH/GENERAL: a payment later than renewalDate + annual grace (HEALTH 30 days, GENERAL 0) → `renewal_window_expired`; a lapsed general contract is renewed from a newer source status instead.
- Annual payment and `renew` set `commercials.expiryDate` to the advanced renewal date − 1 day, so `renewalDate` stays equal to `commercials.renewalDate()`.

### 3.2 Premium schedule and due engine (F72)
```ts
export interface GracePolicy { graceDays(mode: PremiumMode): number; revivalYears: number }
export const LIFE_GRACE: GracePolicy           // MONTHLY 15 days, others 30 days; revival 5 years (IRDAI product regulations baseline; tenant-configurable later)
export interface Installment { dueDate: string; amountPaise: number }
export function scheduleFrom(policy: HeldPolicyProps, from: string, count: number): Installment[]   // pure: next `count` dues from `from`; SINGLE → none after commencement; month-end clamping (31 Jan + 1 month → 28/29 Feb)
export type DueStatus = 'UPCOMING' | 'DUE_TODAY' | 'IN_GRACE' | 'LAPSED' | 'REVIVABLE' | 'RENEWAL_DUE' | 'PAID';
export class DueEngine {
  constructor(grace: GracePolicy)
  classify(policy: HeldPolicyProps, today: string): { status: DueStatus; dueDate?: string; graceEndsOn?: string; revivalEndsOn?: string; daysToDue?: number }
  // LIFE: today < due → UPCOMING (daysToDue); = due → DUE_TODAY; ≤ due + grace → IN_GRACE; ≤ due + revivalYears → REVIVABLE (status LAPSED); beyond → LAPSED
  // HEALTH/GENERAL: renewalDate − 45 days … renewalDate → RENEWAL_DUE; HEALTH: ≤ renewalDate + 30 days → IN_GRACE, beyond → LAPSED; GENERAL has no grace: after renewalDate → LAPSED
  classifyInstallment(policy: HeldPolicyProps, dueDate: string, today: string): DueClassification   // classify() with dueDate treated as the next unpaid due (calendar rows)
  window(policies: HeldPolicyProps[], from: string, to: string): Array<{ policyId: string; dueDate: string; status: DueStatus; amountPaise: number }>   // scheduled installments, status UPCOMING; callers classify per installment
}
```
Revival ends on due + `revivalYears` calendar years. Schedule month-end clamping keeps the commencement-day anchor (31 Jan → 28 Feb → 31 Mar).

### 3.3 Lifecycle alerts (F73, Strategy)
`LifecycleAlertRule { kind; occursOn(policy, parties, year): string | undefined }` — `MaturityRule` (maturityDate, alert 90/30 days ahead), `SurvivalBenefitRule` (product key facts `survivalBenefitYears`), `AnniversaryRule` (commencement anniversary), `FreeLookEndRule` (commencement + 30 days for PLATFORM_SALE and distance sales; + 15 days otherwise), `AgeChangeRule` (insured's insurance-age change date: next birthday − 6 months, needs M03 `dobYear` and `birthday` month/day — never decrypts DOB; skipped when either is unknown), `BirthdayRule` (requires `birthday` month/day from M03 internal summary; otherwise skipped). `LifecycleAlertEngine.alertsBetween(policies, parties, from, to)` → sorted alerts; each alert has a stable key `${policyId}:${kind}:${date}` so the daily job emits once. Feb 29 clamps to Feb 28 in non-leap years. Date rules use each INSURED/LIFE_ASSURED role party when present, otherwise the proposer; policies in a terminal status (MATURED, SURRENDERED, CLAIMED, EXPIRED, CANCELLED) get no alerts. `survivalBenefitYears` comes from M05 `VersionDetail.keyFacts` (comma-separated positive integer anniversary years; absent or invalid → no alert).

### 3.4 Book import (F71)
```ts
export type ImportFormat = 'CSV_TEMPLATE' | 'LIC_PORTAL' | 'GENERIC_PORTAL';
export interface ColumnMapping { [canonical: string]: string }   // canonical keys: policyNumber, insurerName, productName, holderName, mobile, email, dob, sumAssured, premium, mode, commencementDate, nextDueDate, maturityDate, renewalDate, status
export interface ImportRow { rowNo: number; raw: Record<string, string>; parsed?: ParsedPolicy; problems: string[]; match?: { kind: 'NEW' | 'DUPLICATE_IN_BOOK' | 'DUPLICATE_IN_FILE' | 'UPDATE'; heldPolicyId?: string }; decision?: 'IMPORT' | 'SKIP' | 'UPDATE' }
export class ImportBatch {   // states: UPLOADED → MAPPED → VALIDATED → (REVIEWED) → COMMITTED | DISCARDED
  static upload(input: { id; format; fileChecksum; asOf; rows: Record<string, string>[] (≤ 5000); now }): ImportBatch
  map(mapping: ColumnMapping): void
  validate(validator: RowValidator, matcher: BookMatcher): void   // sets parsed/problems/match; default decision IMPORT (NEW), SKIP (duplicates), UPDATE (newer asOf)
  decide(rowNo: number, decision): void                         // review queue
  readyToCommit(): boolean                                      // every row has a decision and no IMPORT/UPDATE row has problems
}
export interface RowValidator { validate(row): string[] }       // chain: required fields, dates (dd/mm/yyyy, yyyy-mm-dd, dd-MMM-yyyy), money (₹, commas, lakh/crore words rejected), mode synonyms (Yly/Hly/Qly/Mly/SSS), mobile/email via kernel VOs
export interface BookMatcher { match(row: ParsedPolicy): Promise<ImportRow['match']> }   // by policyNumberHash within tenant; within-file duplicates by hash
```
Duplicate CSV headers get positional suffixes (`Remarks`, `Remarks#2`) in raw keys and mappings; no column is silently overwritten. Both gross-premium columns must agree. Warnings are kept separate from blocking problems. A batch stores the uploading member/org scope and its commit progress; each transaction covers at most 200 rows with stable batch+row progress and commission keys. A successful commit or discard purges raw and parsed PII and keeps only the summary. All import routes enforce the uploader's record scope.

Holders are resolved through M03 `PartyFacade.findOrCreate({ onDuplicate: 'link', source: { kind: 'BOOK' } })`; role link PROPOSER on subject HELD_POLICY.

### 3.5 Servicing request (F74)
`ServicingRequest`: `{ id, heldPolicyId, kind: 'ADDRESS_CHANGE' | 'NOMINEE_CHANGE' | 'BANK_MANDATE' | 'SURRENDER' | 'LOAN' | 'CLAIM' | 'DUPLICATE_POLICY' | 'OTHER', insurerRef?, status: 'OPEN' | 'SUBMITTED_TO_INSURER' | 'AWAITING_CUSTOMER' | 'RESOLVED' | 'REJECTED', followUpOn?, portalUrl? (https only), notes: Array<{ at, by, text }> (SensitiveContentGuard), version }`; transitions OPEN → SUBMITTED_TO_INSURER → (AWAITING_CUSTOMER ↔ SUBMITTED_TO_INSURER) → RESOLVED | REJECTED.

## 4. Ports
```ts
export interface HeldPolicyRepository { get; save; findByNumberHash(tx, hash): Promise<HeldPolicy | undefined>; list(tx, filter: { scope: RecordScope; partyId?; line?; status?; q?; cursor?; limit }): Promise<Page<HeldPolicy>>; forParty(tx, partyId): Promise<HeldPolicy[]>; dueBetween(tx, from, to, scope): Promise<HeldPolicy[]>; renewalsBetween(tx, from, to): Promise<HeldPolicy[]> }
export interface ImportBatchRepository { get; save; findByChecksum(tx, checksum): Promise<ImportBatch | undefined> }
export interface ServicingRepository { get; save; forPolicy(tx, policyId): Promise<ServicingRequest[]>; openFollowUpsBefore(tx, date, memberId?): Promise<ServicingRequest[]> }
export interface AlertLedger { emittedKeys(tx, keys: string[]): Promise<Set<string>>; record(tx, keys: string[]): Promise<void> }   // once-only lifecycle alerts
export interface IssuedPolicyReader { read(tx, policySaleId): Promise<{ insurerConfirmed: boolean; policySaleId: string; policyNumber: string; policy: HeldPolicyInput } | undefined> }   // M09 producer; until M09 exists the default reader throws dependency_unavailable so the outbox event is retried
// From other modules: PARTY_FACADE + FIELD_CIPHER hash (M03), RECORD_SCOPE_PROVIDER (M02), CATALOGUE lookup (M05), OPPORTUNITY creation via CRM (M04 `RenewalOpportunityPort`), MY_WORK_CONTRIBUTORS (M04 multi-provider)
```

## 5. Application services

| Service | Behaviour |
|---|---|
| `HeldPolicyService` | register (manual), get/list (scoped, masked policy number `XXXX1234`), record payment, status update with asOf rule, assign servicing member; events `book.policy.registered`, `book.policy.payment_recorded`, `book.policy.status_changed` (ids/enums only) |
| `DueService` | `calendar(principal, from, to)` → days with dues `{ policyId, holderName, dueDate, status, amountPaise }`; `today(principal)` → due today, in grace, lapsing within 7 days; `DueContributor` adds DUE items to M04 my-work (priority 0 for IN_GRACE items whose grace ends ≤ 3 days, otherwise 1); the calendar classifies each installment with `classifyInstallment` |
| `LifecycleService` | daily job per tenant: alerts for the next 30 days not yet emitted → event `book.lifecycle.alert` `{ policyId, kind, date }` (M12 reminders subscribe) |
| `BookImportService` | upload → map (suggested mapping by header synonyms, also per known insurer export) → validate → review decisions → commit (one unit of work per 200 rows, idempotent by fileChecksum + row hash) → summary; events `book.import.committed` |
| `ServicingService` | create, transition, add note, follow-up list; follow-ups due today appear in my-work |
| Jobs | `LifecycleService.run(tenantId)` and `RenewalOpportunityJob.run(tenantId)` are invocable per-tenant methods; the deployment scheduler is an infrastructure follow-up |
| `RenewalOpportunityJob` | HEALTH/GENERAL policies with renewalDate in 45 days and no open renewal opportunity → M04 opportunity (DISCOVERY, title "Renewal — <product>", owner = servicing member) |
| `BookSubscribers` | `crm.opportunity.issued` / `proposal.policy.issued` → held policy with source PLATFORM_SALE (F20); `party.party.merged` → relink proposer |

## 6. API (`/api/v1`; ✱ = `@Idempotent()`)
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/held-policies?partyId=&line=&status=&q=&limit=&cursor=` | `book.read` | masked policy numbers; `q` = last 4 digits or holder name |
| POST ✱ | `/held-policies` | `book.write` | manual register → 201. Body `{ proposerPartyId, policyNumber, line, insurerId?, insurerName, productVersionId?, productName, mode, commercials, sumAssuredPaise?, nextDueDate?, maturityDate?, premiumPayingTermYears?, policyTermYears?, status?, statusAsOf?, asOf, confidence?, distanceSale?, servicingMemberId?, orgUnitId?, risk?, customFields? }`; source is always MANUAL |
| GET | `/held-policies/{id}` | `book.read` | detail + schedule (next 12 installments) + due status + servicing requests + source/as-of banner |
| POST ✱ | `/held-policies/{id}/payments` | `book.write` | `{ installmentDue, paidOn }` |
| PATCH | `/held-policies/{id}` (`If-Match`) | `book.write` | status (with asOf), servicing member, renewal, commercials, risk, custom fields; stale version → 412 |
| GET | `/dues?from=&to=` / `/dues/today` | `book.read` | calendar / today buckets |
| POST ✱ | `/book-imports` | `book.import` | `{ format, fileChecksum, asOf, rows }` → 201 batch with suggested mapping |
| PUT | `/book-imports/{id}/mapping` | `book.import` | → validated rows summary |
| GET | `/book-imports/{id}` | `book.import` | batch state, progress and provenance |
| GET | `/book-imports/{id}/rows?filter=problems|duplicates|all` | `book.import` | review queue |
| PUT | `/book-imports/{id}/rows/{rowNo}/decision` | `book.import` | `{ decision }` |
| POST ✱ | `/book-imports/{id}/commit` | `book.import` | → `{ imported, updated, skipped, parties: { created, linked } }` |
| GET | `/servicing-requests?followUpBefore=YYYY-MM-DD` | `book.servicing` | `{ items }` scoped through held policies, sorted by follow-up date |
| POST ✱ | `/held-policies/{id}/servicing-requests` · PATCH `/servicing-requests/{id}` · POST ✱ `/servicing-requests/{id}/notes` | `book.servicing` | |

Read views show `policyNumber` as `XXXX<last4>`, the gross `premiumPaise` alias, source/as-of/confidence and version; encryption and hash fields are never returned.

Permissions: `SALESPERSON, SOLO_OWNER → book.read, book.write, book.servicing` (+ `book.import` for SOLO_OWNER); managers + `book.import`; `OPS → book.*`; `TENANT_ADMIN → book.*`; `COMPLIANCE → book.read`.

## 7. DDL — `070_book.sql`
`held_policy` (policy_number_enc P2, policy_number_hash unique per tenant, status/source checks, as_of), `premium_payment`, `book_import_batch` (unique tenant+checksum), `book_import_row` (jsonb raw is **deleted on commit/discard** — raw files never persist), `servicing_request`, `servicing_note`, `lifecycle_alert_ledger` (pk tenant+key); RLS on all.

## 8. Observability
Events above; metrics `book_import_rows_total{outcome}`, `book_dues_computed_total`, `book_lifecycle_alerts_total{kind}`; business monitor "dues job freshness" (HLD §16). Logs carry policy ids and last-4 only.

## 9. Frontend (apps/web/src/features/book)
| Route | Screen | Behaviour |
|---|---|---|
| `/m/dues` | `DueCalendarScreen` (M04) | month grid with counts, day list (holder, product, amount, status chip, grace end), filters (life/health/general), "Mark paid" sheet, WhatsApp reminder action (M12) |
| `/m/book/import` | `BookImportScreen` (M05) | upload CSV (parsed client-side) → suggested mapping editor → validation summary → review queue (problems / duplicates / updates) with per-row decision → commit result with "re-running the same file skips imported rows" |
| `/crm/customers/:id` Policies tab | `HeldPoliciesPanel` | list with source + as-of chip ("Imported 12 Mar 2026 · confidence medium"), schedule, servicing requests |
| `/m/servicing` | `ServicingTrackerScreen` | open requests by follow-up date, status updates, notes |

## 10. Acceptance criteria
- **AC-M07-01** Held policy registration validates dates, mode/line compatibility and premium; policy numbers are stored encrypted with a lookup hash and only last-4 is shown.
- **AC-M07-02** Status changes follow the state table; an older `asOf` never overwrites a newer status.
- **AC-M07-03** Schedule generation per mode with month-end clamping; SINGLE has no further dues.
- **AC-M07-04** Due engine: UPCOMING / DUE_TODAY / IN_GRACE (15 days monthly, 30 otherwise) / REVIVABLE / LAPSED for life; RENEWAL_DUE window and health grace for annual contracts — boundary dates tested.
- **AC-M07-05** Recording a payment advances the next due and revives a policy within the revival window.
- **AC-M07-06** Lifecycle alerts: each rule's date logic; alerts are emitted once per key; age-change uses DOB year and birthday month/day only, never decrypts DOB, and is skipped when either is unknown.
- **AC-M07-07** Import: header synonyms map automatically; validator rejects bad dates, money words, unknown modes and invalid contacts with row reasons; duplicates within file and against the book are detected by policy-number hash.
- **AC-M07-08** Import review and commit: decisions required; commit creates parties via M03 (link on strong match), held policies with source IMPORT and as-of; re-running the same file imports nothing; raw rows are deleted after commit.
- **AC-M07-09** Due list and my-work contributor: due today / in grace items appear for the servicing member only (record scope).
- **AC-M07-10** Renewal job creates one opportunity per expiring health/general policy, never duplicates.
- **AC-M07-11** A platform sale (insurer-confirmed) creates a held policy with source PLATFORM_SALE exactly once.
- **AC-M07-12** Servicing request transitions, notes guard against PAN/Aadhaar/card numbers, follow-ups in my-work.
- **AC-M07-13** Tenant isolation and record scope on every endpoint.
- **AC-M07-14** Postgres: migration, RLS, unique policy hash per tenant, raw import rows removed after commit. *(integration)*
- **AC-M07-15** Due calendar, book import wizard, policies tab and servicing tracker screens as described in §9.

## 11. CR-001 additions — register fields, risk details, custom fields, "Office sales register" import

Source: [CR-001](../change-requests/CR-001-sales-register-fields.md). Kernel pieces (`PolicyCommercials`, risk schemas, custom fields) are in M00 §16 and are built already; everything below is built with M07. Where this section and §3–§10 differ, this section wins.

### 11.1 Held policy
`HeldPolicyProps` gains:
```ts
commercials: PolicyCommercialsProps;          // kernel M00 §16.4 — category, businessType, previousInsurerName?, bookedOn, commencementDate, expiryDate?, policyTermMonths?,
                                              // premiumNetPaise / premiumTaxPaise / premiumGrossPaise, bookingChannelCode?, businessSource?, referredBy?, remarks?
bookingChannel?: { code: string; insurerCodeId?: string };   // insurerCodeId when the code matches an M02 insurer code of the tenant
risk?: { schemaId: string; schemaVersion: number; details: unknown };   // validated by the risk SchemaRegistry + checkRiskAgainstCommercials
registrationNoLast4?: string;                 // motor: P2 registration number stored enc + hash + last4 (never in risk JSONB)
customFields: CustomFieldValues;              // entity 'held_policy'
```
- `line` stays and must equal `commercials.line`; `premiumPaise` is replaced by `commercials.premiumGrossPaise` (gross, with GST) — `premiumPaise` remains as a read alias in views; `commencementDate` comes from `commercials`.
- `renewalDate` for HEALTH/GENERAL = `commercials.renewalDate()` (expiry + 1 day) when an expiry is known; `policyTermMonths` supports short-term motor/travel.
- `referredBy` is never the seller: `servicingMemberId` / seller stay as they are.
- `HeldPolicy.register` calls `PolicyCommercials.create` and, when `riskSchemaFor(category)` is defined and risk details are given, `SchemaRegistry.parse` + `checkRiskAgainstCommercials(…, today)`.

### 11.2 Import (extends §3.4)
- Canonical keys added: `bookedOn`, `expiryDate`, `category` (+ line derived), `businessType`, `previousInsurerName`, `policyTerm` ('1 YEAR', '6 MONTHS', '3 YEARS' → months), `premiumNet`, `premiumGross`, `premiumTax`, `odPremium`, `tpPremium`, `ncb`, `registrationNo`, `registrationYear`, `familySizeOrModel`, `bookingChannelCode`, `businessSource`, `referredByName`, `remarks`, `commissionAmount`, `commissionRatePct`, `commissionRemarks`, `invoiceNo`, and `custom:<key>` (a tenant custom field of entity `held_policy`) and `risk:<field>`.
- **Saved mapping profile "Office sales register"** (`ImportFormat` gains `'OFFICE_SALES_REGISTER'`): header synonyms (case/space-insensitive) — `S. No.`→rowNo, `Month`→ignored (derived), `Company Name`→insurerName, `Type`→category, `Client Name`→holderName, `CONTACT NO.`→mobile, `BOOKING DATE`→bookedOn, `RISK START DATE`→commencementDate, `POLICY END DATE`→expiryDate, `Plan Name`→productName, `Family Size/Model`→familySizeOrModel, `Regn. No.`→registrationNo, `Regn. Year`→registrationYear, `Policy No.`→policyNumber, `SI/IDV`→sumAssured, `NCB YES/NO PY`→ncb, `Final Premium`→premiumGross (cross-checked with `Prem. with GST`), `OD PREMIUM`→odPremium, `Premium w/o GST`→premiumNet, `Prem. with GST`→premiumGross, `Intermediary`→bookingChannelCode, `Port/Fresh/Rollover`→businessType, `Term`→policyTerm, `Proposer DOB`→dob, first `Remarks`→remarks, `Reference`→referredByName, `SOURCE`→businessSource, `Commission`→commissionAmount, `%`→commissionRatePct, second `Remarks`→commissionRemarks, `Invoice No.`→invoiceNo. Duplicate header names are disambiguated by position (first/second occurrence).
- Value rules: dates `dd-mm-yyyy` (plus the existing formats); `Type` HEALTH → HEALTH line, category from `Family Size/Model` (INDIVIDUAL → HEALTH_INDIVIDUAL, FLOATER/2A+1C-style mixes → HEALTH_FLOATER); MOTOR → MOTOR; LIFE → LIFE with category OTHER unless the product matches M05; `Port/Fresh/Rollover` FRESH/RENEWAL/PORT(ABILITY)/ROLLOVER; `SOURCE` IN HOUSE → IN_HOUSE (others by synonym table, unknown → OTHER with a row warning); premium tax = gross − net (negative → row error `premium_mismatch`); when only gross is present, net is required for commission rows (row error `premium_net_required`).
- **Money columns** (Commission, all premiums, SI/IDV, OD premium): a non-numeric value is a row error `invalid_amount` naming the column — never zero, never shifted (CR-001 D2). Mapping is by header with a preview-and-confirm step.
- **Referrer** (D1): `Reference` → `commercials.referredBy.name` as written; the validator suggests `referredBy.memberId` / `partyId` by exact normalised-name match within the tenant (M02 members, M03 parties) and shows it in the review queue; the link is stored only after the importer confirms it (`PUT /book-imports/{id}/rows/{rowNo}/referrer` `{ memberId? , partyId? }`); otherwise only the name is kept. The seller stays unchanged.
- Commission columns create, on commit, an M10 RECEIVED entry linked to the new held policy (`commissionAmount`, `ratePct`, `reason` = commission remarks, `invoiceNo`), via the M10 `CommissionImportPort`; rows without a commission amount create none.

### 11.3 API changes
- `POST /held-policies` and `PATCH /held-policies/{id}` accept the commercials fields, `risk` and `customFields`; `GET /held-policies?…` gains filters `category`, `businessType`, `businessSource`, `bookedFrom`, `bookedTo`, `referredBy` (name contains) and `cf.<key>=<value>` for reportable custom fields (non-reportable or unknown key → 400 `custom_field_not_reportable`).
- `PUT /book-imports/{id}/rows/{rowNo}/referrer` (`book.import`) as above.

### 11.4 DDL (`070_book.sql`, extended)
`held_policy` adds: `booked_on date not null`, `expiry_date date`, `product_category text not null`, `business_type text not null check (business_type in ('FRESH','RENEWAL','PORTABILITY','ROLLOVER'))`, `previous_insurer_name text`, `policy_term_months int`, `premium_net_paise bigint not null`, `premium_tax_paise bigint not null`, `premium_gross_paise bigint not null`, `check (premium_net_paise + premium_tax_paise = premium_gross_paise)`, `booking_channel_code text`, `booking_insurer_code_id text`, `business_source text`, `referred_by_name text`, `referred_by_party_id text`, `referred_by_member_id text`, `remarks text`, `risk_details jsonb`, `risk_schema_id text`, `risk_schema_version int`, `registration_no_enc text`, `registration_no_hash text`, `registration_no_last4 text`, `custom_fields jsonb not null default '{}'`, `custom_schema_version int not null default 1`; check: risk_details null ⇔ risk_schema_id null. Indexes on (tenant_id, booked_on), (tenant_id, business_source), (tenant_id, referred_by_name).

### 11.5 Screens
Held-policy detail gains sections per line (motor: registration last-4, make/model, NCB, OD/TP; health: cover type and member mix e.g. "Floater · 2A+1C", portability), commercials (booked on, business type, source, referred by, channel), and the shared `CustomFieldsSection` (entity `held_policy`). The import screen gets the "Office sales register" profile in the format picker and a referrer-confirmation column in the review queue.

### 11.6 Acceptance criteria
- **AC-CR001-01** Importing the sample register row (`1 | JULY | STAR HEALTH | HEALTH | NITISH VATS | 99532xxxxx | 02-07-2026 | 02-07-2026 | 01-07-2027 | ASSURE | INDIVIDUAL | … | 199734823 | 1000000 | | 29466 | | 29466 | 29466 | OFFICE M11-DIRECT | FRESH | 1 YEAR | … | IN HOUSE | SAURABH`) creates the party (masked contact), a HEALTH held policy (category HEALTH_INDIVIDUAL, business type FRESH, booked 2026-07-02, risk start 2026-07-02, expiry 2027-07-01, renewal 2027-07-02, SI ₹10,00,000, gross ₹29,466) and links the seller.
- **AC-CR001-02** (M07 part) Motor rows validate the registration number, NCB and OD + TP ≤ net premium with row reasons; the registration number is stored encrypted with a hash and shown as last-4.
- **AC-CR001-04** (M07 part) An import column mapped to `custom:branch_code` stores the value on the held policy, and `GET /held-policies?cf.branch_code=…` filters by it; filtering by a non-reportable field → 400.
- **AC-CR001-06** A register row whose *Reference* is "SAURABH" stores `referred_by_name = 'SAURABH'`, leaves the seller unchanged and links `referred_by_member_id` only after the importer confirms a suggested match; a row with text in *Commission* is rejected with `invalid_amount` naming the column.
