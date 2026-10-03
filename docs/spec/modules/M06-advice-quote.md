# M06 · Advice & Quote — low-level design

Status: Ready for build · Depends on: M00–M05 · Requirements: Rev 3.0 F14, F15, F75, F76, F77 (research use), F78 (advice record), §6 data model ("Needs analysis and advice record", "Quote, benefit illustration"), launch acceptance LA-6 (permitted comparison) · HLD §7 (Advice & Quote), §8 (insurer owns pricing, BI and wording — the platform never computes premiums or illustrations) · Screens: M06 `Calculators`, M08 `Compare` (quote part), M09 `QuoteBI`, CRM02 lead/opportunity "Quote" action

## 1. Responsibilities

- **Needs analysis** (F76): five educational calculators with versioned, stated assumptions. Outputs are guidance, never a recommendation by themselves.
- **Advice record** (F78): what was analysed, which products were *in scope* (M05) and shown, what was recommended, what the customer chose and why — finalised once and immutable afterwards (regulatory evidence).
- **Quote workspace** (F14, F15): quote requests per opportunity; options captured manually from an insurer portal or, later, through a connected adapter (M08); validity, premium components, coverage, exclusions; one selected option; a shareable comparison.
- **Benefit illustration evidence** (F75): attach the insurer-generated BI / quote document with its version and record the customer's acknowledgement. The platform never generates an illustration or a premium.

Out of scope: proposal forms and submission (M09), document storage itself (M13 pointers only; until M13 a `documentRef` is an opaque string validated by pattern).

## 2. Module layout
```
apps/core/src/modules/advice/
  domain/
    calculators/            protection-gap.ts, retirement.ts, child-goal.ts, health-sum-insured.ts, floater.ts, assumptions.ts
    advice-record.ts        AdviceRecord aggregate (draft → finalised)
    quote.ts                QuoteRequest aggregate, QuoteOption, PremiumBreakdown
    benefit-illustration.ts BiRecord, Acknowledgement
    share-token.ts          ShareToken (signed, expiring, read-only comparison)
    events.ts
  application/
    ports.ts, advice-context.ts
    calculator.service.ts, advice.service.ts, quote.service.ts, bi.service.ts, share.service.ts
  infrastructure/ in-memory-advice.repositories.ts, pg-advice.repositories.ts
  api/ schemas.ts, calculators.controller.ts, advice.controller.ts, quotes.controller.ts, public-share.controller.ts
  advice.module.ts
apps/core/migrations/060_advice.sql
apps/web/src/features/advice/
```

## 3. Domain model

### 3.1 Calculators (pure functions, F76)
All money is integer paise; rates are decimals; every calculator takes an `Assumptions` object and returns `{ result, workings: Array<{ label, value }>, assumptionsVersion }`. Inputs are validated (`ValidationError` with field errors); no calculator reads the clock — `asOf` is passed in.

```ts
export interface Assumptions {
  version: string;                 // e.g. '2026.1' — stored with every run and advice record
  inflation: number;               // 0.06
  returnPreRetirement: number;     // 0.10
  returnPostRetirement: number;    // 0.07
  educationInflation: number;      // 0.10
  medicalInflation: number;        // 0.12
  lifeExpectancy: number;          // 85
}
export const DEFAULT_ASSUMPTIONS: Assumptions   // version '2026.1' with the values above
export interface CalcOutput<R> { result: R; workings: Array<{ label: string; value: string }>; assumptionsVersion: string }

export function protectionGap(input: { annualIncomePaise: number; annualExpensesPaise: number; yearsToRetire: number; liabilitiesPaise: number; existingCoverPaise: number; liquidAssetsPaise: number }, a: Assumptions): CalcOutput<{ humanLifeValuePaise: number; recommendedCoverPaise: number; gapPaise: number }>
// HLV = PV of (income − personal expenses) over yearsToRetire at real rate ((1+returnPre)/(1+inflation) − 1); recommended = HLV + liabilities; gap = max(0, recommended − existingCover − liquidAssets); rounded to the nearest ₹1,00,000 (10,000,000 paise) upwards
export function retirementCorpus(input: { currentAge: number; retireAge: number; monthlyExpensePaise: number; existingCorpusPaise: number; monthlySipPaise: number }, a: Assumptions): CalcOutput<{ corpusNeededPaise: number; projectedPaise: number; shortfallPaise: number; monthlySipNeededPaise: number }>
// expense inflated to retirement; corpus = PV at retirement of inflation-growing expenses for (lifeExpectancy − retireAge) years at returnPost; projection of existing corpus + SIP at returnPre
export function childGoal(input: { goal: 'EDUCATION' | 'MARRIAGE'; currentCostPaise: number; yearsToGoal: number; savedPaise: number }, a: Assumptions): CalcOutput<{ futureCostPaise: number; shortfallPaise: number; monthlySipNeededPaise: number }>
// EDUCATION inflates at educationInflation, MARRIAGE at inflation
export function healthSumInsured(input: { cityTier: 1 | 2 | 3; ages: number[]; existingCoverPaise: number; preExisting: boolean }, a: Assumptions): CalcOutput<{ recommendedPaise: number; gapPaise: number; note: string }>
// base by tier (1: ₹10L, 2: ₹7L, 3: ₹5L) + 25% if any age ≥ 45 + 25% if preExisting, then 3-year medicalInflation uplift; rounded up to ₹1L
export function floaterSizing(input: { members: Array<{ age: number }>; cityTier: 1 | 2 | 3 }, a: Assumptions): CalcOutput<{ floaterPaise: number; individualTotalPaise: number; recommendation: 'FLOATER' | 'INDIVIDUAL' | 'FLOATER_PLUS_SENIOR_INDIVIDUAL' }>
// any member ≥ 60 with others < 45 → FLOATER_PLUS_SENIOR_INDIVIDUAL; ≤ 4 members all < 45 → FLOATER; else INDIVIDUAL
```
Validation bounds: ages 0–100, `retireAge > currentAge`, `yearsToGoal 1–30`, money ≥ 0 and ≤ ₹100 crore, members 1–8.

### 3.2 Advice record (F78) — draft → finalised
```ts
export type AdviceStatus = 'DRAFT' | 'FINALISED';
export interface AdviceRecordProps {
  id: string; partyId: string; opportunityId?: string; advisorMemberId: string;
  calculatorRuns: Array<{ calculator: string; inputs: Record<string, unknown>; outputs: Record<string, unknown>; assumptionsVersion: string; ranAt: string }>;
  scope: { disclosure: string; entityType: string; versionIdsShown: string[]; excludedCount: number; evaluatedOn: string };   // snapshot of M05 ScopeResult
  recommended: Array<{ versionId: string; rationale: string }>;     // each must be in scope.versionIdsShown
  customerChoice?: { versionId: string; reasonIfDifferent?: string };
  suitabilityNotes: string;            // ≤ 2000, SensitiveContentGuard (M04) applies: no PAN/Aadhaar/card numbers
  status: AdviceStatus; finalisedAt?: string; version: number; createdAt: string;
}
export class AdviceRecord {
  static start(input: { id; partyId; opportunityId?; advisorMemberId; scope: AdviceRecordProps['scope']; now: Date }): AdviceRecord
  addCalculatorRun(run): void                      // DRAFT only
  recommend(versionId: string, rationale: string): void   // not in scope.versionIdsShown → BusinessRuleError('product_out_of_scope'); rationale 10..500
  recordChoice(versionId: string, reasonIfDifferent?: string): void   // when not among recommended, reason required (ValidationError('choice_reason_required'))
  setNotes(text: string): void
  finalise(now: Date): void                        // requires ≥ 1 recommendation and a customer choice → else BusinessRuleError('advice_incomplete', { missing })
  // every mutator on FINALISED → BusinessRuleError('advice_finalised')
}
```

### 3.3 Quote workspace (F14, F15)
```ts
export type QuoteSource = 'MANUAL_PORTAL' | 'INSURER_API';
export interface PremiumBreakdown { basePaise: number; ridersPaise: number; taxPaise: number; totalPaise: number; frequency: 'ANNUAL' | 'HALF_YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'SINGLE' }
// invariant: total = base + riders + tax (ValidationError('premium_components_mismatch'))
export interface QuoteOptionProps {
  id: string; versionId: string; insurerId: string; source: QuoteSource; insurerQuoteRef?: string;
  sumAssuredPaise: number; policyTermYears?: number; premiumPayingTermYears?: number; premium: PremiumBreakdown;
  coverage: Array<{ label: string; value: string }>; exclusions: string[]; waitingPeriods: Array<{ label: string; months: number }>;
  assumptions: Record<string, string>;      // e.g. smoker: 'no', zone: 'A' — as quoted by the insurer
  validUntil: string;                         // ISO date; expired options cannot be selected
  capturedBy: string; capturedAt: string;
}
export type QuoteStatus = 'OPEN' | 'SHARED' | 'SELECTED' | 'EXPIRED' | 'WITHDRAWN';
export class QuoteRequest {
  static open(input: { id; opportunityId; partyId; line; insuredPartyIds: string[]; requirements: Record<string, string>; adviceRecordId?; now: Date }): QuoteRequest
  addOption(o: QuoteOptionProps, now: Date): void       // ≤ 10 options; duplicate (versionId + insurerQuoteRef) → ConflictError('duplicate_option'); status OPEN|SHARED
  removeOption(optionId: string): void                   // not after selection
  markShared(now: Date): void                            // OPEN → SHARED (needs ≥ 1 option)
  select(optionId: string, now: Date): void              // option validUntil ≥ today else BusinessRuleError('quote_expired'); → SELECTED; only once
  expireIfStale(today: string): boolean                  // all options past validity and not SELECTED → EXPIRED
  comparison(): ComparisonRow[]                          // rows: premium total, sum assured, key coverage labels union, exclusions, waiting periods — one column per option
}
```

### 3.4 Benefit illustration evidence (F75)
```ts
export interface BiRecordProps {
  id: string; quoteOptionId: string; documentRef: string /* M13 pointer: /^doc_[A-Z0-9]{26}$/ */; insurerBiVersion: string; uploadedBy: string; uploadedAt: string;
  acknowledgement?: { method: 'CUSTOMER_LINK' | 'ASSISTED'; at: string; by: string; evidenceRef?: string };
}
export class BiRecord {
  static attach(input): BiRecord
  acknowledge(ack, now: Date): void       // once; ASSISTED requires evidenceRef (e.g. signed form photo doc ref)
}
```
Selecting a quote option for a LIFE savings/ULIP/pension product requires an acknowledged BI for that option (`BusinessRuleError('bi_acknowledgement_required')`) — IRDAI BI rules; protection-only (TERM) and HEALTH do not.

### 3.5 Share token
Signed (HMAC-SHA256 with `SHARE_TOKEN_SECRET`) `{ quoteRequestId, tenantId, exp }`, base64url; default validity 7 days; read-only comparison page; verified with timing-safe compare; tenant from the token and the verified host must match.

## 4. Ports (application/ports.ts)
```ts
export interface AdviceRepository { get(tx, id): Promise<AdviceRecord | undefined>; save(tx, a: AdviceRecord): Promise<void>; forParty(tx, partyId: string): Promise<AdviceRecord[]> }
export interface QuoteRepository { get(tx, id): Promise<QuoteRequest | undefined>; save(tx, q: QuoteRequest): Promise<void>; forOpportunity(tx, opportunityId: string): Promise<QuoteRequest[]>; findOption(tx, optionId: string): Promise<{ request: QuoteRequest; option: QuoteOptionProps } | undefined>; openWithValidityBefore(tx, date: string, limit: number): Promise<QuoteRequest[]> }
export interface BiRepository { get(tx, id): Promise<BiRecord | undefined>; save(tx, b: BiRecord): Promise<void>; forOption(tx, optionId: string): Promise<BiRecord[]> }
export interface CalculatorRunRepository { add(tx, run: CalculatorRun): Promise<void>; forParty(tx, partyId: string, limit: number): Promise<CalculatorRun[]> }
// From other modules: COMPARISON_SCOPE_FACADE (M05), CATALOGUE_QUERY (M05 version details), PARTY_FACADE (M03), OPPORTUNITY_LOOKUP (M04: scope + owner + stage move to QUOTE_SHARED via CrmPort event)
```

## 5. Application services

| Service | Method | Rules |
|---|---|---|
| `CalculatorService` | `run(principal, calculator, input, { partyId? })` | validates, computes with `DEFAULT_ASSUMPTIONS` (tenant override later), stores a run when `partyId` given (record scope via party), metric `advice_calculator_runs_total{calculator}`; returns `CalcOutput` |
| `AdviceService` | `start(principal, { partyId, opportunityId?, line?, category? })` | snapshots `ComparisonScopeFacade.scopeFor` (versionIdsShown = in-scope ids, disclosure text) |
| | `attachRun`, `recommend`, `recordChoice`, `setNotes`, `finalise` | finalise emits `advice.record.finalised` `{ adviceRecordId, partyId, opportunityId, recommendedCount, choseRecommended }`; audit |
| | `get(id)` | advice view incl. product names (M05) |
| `QuoteService` | `open(principal, { opportunityId, insuredPartyIds, requirements, adviceRecordId? })` | opportunity in caller's scope (M04); party links |
| | `addOption(principal, quoteId, input)` | `ComparisonScopeFacade.assertInScope(versionId)` (LA-6); `ValidityPolicy`: validUntil ≤ 60 days ahead; emits `quote.option.created` `{ quoteRequestId, optionId, versionId }` (M05 locks the version) |
| | `share(principal, quoteId)` → `{ url, expiresAt }` | marks SHARED; event `quote.request.shared` (M04 moves opportunity DISCOVERY → QUOTE_SHARED) |
| | `select(principal, quoteId, optionId)` | BI rule (§3.4); event `quote.option.selected` `{ quoteRequestId, optionId, versionId, totalPaise }` (M09 proposal start) |
| | `comparison(quoteId)` | rows from §3.3 plus scope disclosure from the linked advice record or a fresh scope evaluation |
| | `expireStale(tenantId, today)` | job: `expireIfStale` for options past validity |
| `BiService` | `attach(principal, optionId, { documentRef, insurerBiVersion })`, `acknowledge(principal, biId, ack)` | audit `advice.bi.acknowledged` |
| `ShareService` | `issue(quoteId)`, `resolve(token, host)` | read-only comparison without customer PII beyond first name; `Cache-Control: no-store`; security log on invalid/expired token |

## 6. API (`/api/v1`; ✱ = `@Idempotent()`)

| Method | Path | Permission | Request → Response |
|---|---|---|---|
| POST | `/calculators/{calculator}/runs` | `advice.calculate` | `{ input, partyId? }` → `CalcOutput` (calculator ∈ protection-gap, retirement, child-goal, health-sum-insured, floater) |
| POST ✱ | `/advice-records` | `advice.write` | `{ partyId, opportunityId?, line?, category? }` → 201 `AdviceView` |
| GET | `/advice-records/{id}` | `advice.read` | `AdviceView` |
| POST ✱ | `/advice-records/{id}/calculator-runs` | `advice.write` | `{ calculator, input }` → `AdviceView` |
| POST ✱ | `/advice-records/{id}/recommendations` | `advice.write` | `{ versionId, rationale }` → `AdviceView` / 403 `product_out_of_scope` |
| PUT | `/advice-records/{id}/customer-choice` (`If-Match`) | `advice.write` | `{ versionId, reasonIfDifferent? }` |
| PUT | `/advice-records/{id}/notes` (`If-Match`) | `advice.write` | `{ text }` |
| POST ✱ | `/advice-records/{id}/finalisation` | `advice.write` | → `AdviceView` / 422 `advice_incomplete` `{ missing }` |
| POST ✱ | `/quotes` | `quote.write` | `{ opportunityId, insuredPartyIds, requirements, adviceRecordId? }` → 201 `QuoteView` |
| GET | `/quotes?opportunityId=` / `/quotes/{id}` | `quote.read` | `QuoteView` (options + comparison rows) |
| POST ✱ | `/quotes/{id}/options` | `quote.write` | option input → 201 `QuoteView` / 403 `product_out_of_scope` |
| DELETE | `/quotes/{id}/options/{optionId}` | `quote.write` | 204 |
| POST ✱ | `/quotes/{id}/shares` | `quote.write` | → `{ url, expiresAt }` |
| POST ✱ | `/quotes/{id}/selection` | `quote.write` | `{ optionId }` → `QuoteView` / 422 `quote_expired` / 422 `bi_acknowledgement_required` |
| POST ✱ | `/quote-options/{optionId}/benefit-illustrations` | `quote.write` | `{ documentRef, insurerBiVersion }` → 201 `BiView` |
| POST ✱ | `/benefit-illustrations/{id}/acknowledgement` | `quote.write` | `{ method, evidenceRef? }` → `BiView` |
| GET | `/public/quote-shares/{token}` | public (host tenant) | read-only comparison |

Permissions: `SALESPERSON, SOLO_OWNER, BRANCH_MANAGER, SALES_MANAGER → advice.*, quote.*`; `OPS → advice.read, quote.read, quote.write`; `COMPLIANCE → advice.read, quote.read`; `TENANT_ADMIN → advice.*, quote.*`. Record scope follows the party (M03) / opportunity (M04).

## 7. DDL — `apps/core/migrations/060_advice.sql`
Tables `calculator_run`, `advice_record` (jsonb sections, `status`, `finalised_at`, trigger-free immutability enforced in the app + `update` grant only while `status = 'DRAFT'` via RLS policy `advice_record_draft_only`), `quote_request`, `quote_option` (`premium_total_paise bigint`, check total = base + riders + tax), `bi_record`; RLS on all; `quote_option` unique `(tenant_id, quote_request_id, version_id, insurer_quote_ref)`.

## 8. Observability
Events `advice.record.finalised`, `quote.option.created`, `quote.request.shared`, `quote.option.selected`, `advice.bi.acknowledged` (ids, enums, paise totals — no names); metrics `advice_calculator_runs_total{calculator}`, `quote_options_total{source}`, `quote_selection_seconds` (open → select histogram); security log `security.quote_share_rejected`.

## 9. Frontend (apps/web/src/features/advice)
| Route | Screen | Behaviour |
|---|---|---|
| `/m/calculators` | `CalculatorsScreen` (M06) | tabs per calculator, inputs in ₹ (converted to paise), result card with workings and "Assumptions v2026.1" link; "Save to customer" when opened from a customer |
| `/crm/opportunities/:id/quote` | `QuoteWorkspaceScreen` (M09) | scope disclosure banner (from advice/scope), add option form (in-scope products only, premium components with live total check), comparison grid, share link copy, select option; BI attach + acknowledgement state per option; "Benefit illustration acknowledgement required" for savings/ULIP/pension |
| `/crm/advice/:id` | `AdviceRecordScreen` | calculator runs, recommendations with rationale, customer choice, notes, finalise (shows missing items) — read-only after finalisation |

## 10. Acceptance criteria
- **AC-M06-01** Protection gap: HLV, recommended cover and gap match reference cases (incl. zero gap when existing cover suffices) and round up to ₹1L.
- **AC-M06-02** Retirement corpus, child goal, health sum insured and floater sizing match reference cases; invalid inputs return field errors.
- **AC-M06-03** Every calculator output carries its assumptions version; runs saved against a party are listed for that party only (record scope).
- **AC-M06-04** Advice record: recommendations only from in-scope versions; choosing a non-recommended product needs a reason; finalise requires a recommendation and a choice; nothing changes after finalisation.
- **AC-M06-05** Quote options: out-of-scope product → 403 `product_out_of_scope`; premium components must add up; at most 10 options; duplicates rejected; validity ≤ 60 days.
- **AC-M06-06** Selection: expired option refused; savings/ULIP/pension option needs an acknowledged BI; TERM and HEALTH do not; only one selection; `quote.option.selected` emitted.
- **AC-M06-07** BI evidence: attach with version, acknowledge once, ASSISTED needs evidence; the platform exposes no premium or illustration computation.
- **AC-M06-08** Share link: signed, expiring, tenant-bound; tampered/expired/other-host tokens refused and security-logged; page shows no contact data.
- **AC-M06-09** `quote.option.created` locks the product version (M05) and `quote.request.shared` moves the opportunity to QUOTE_SHARED (M04).
- **AC-M06-10** Record scope and tenant isolation on every endpoint.
- **AC-M06-11** Postgres: migration applies; RLS; finalised advice records cannot be updated by the app role. *(integration)*
- **AC-M06-12** Calculators screen: inputs, result with workings, assumptions version, save to customer.
- **AC-M06-13** Quote workspace: disclosure banner, in-scope product picker, live premium total check, comparison grid, share, select with BI gate messaging.
- **AC-M06-14** Advice record screen: missing-items on finalise, read-only after finalisation.
