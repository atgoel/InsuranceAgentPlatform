# M05 · Product Catalogue & Comparison Scope — low-level design

Status: Ready for build · Depends on: M00, M01 (tie-ups, entity type), M02 (selling scope) · Requirements: Rev 3.0 F13, F67, F77, F78, §1 structural rules, §18 (tie-up limits, comparison and advice); launch acceptance LA-6 · HLD §7 (Product Catalogue; comparison scope engine is "the single gate"), §5 (Strapi product blocks by reference only) · Screens: W07 `TenantSetup` (catalogue tab), M07 `ResearchAssistant` (library part), M08 `NeedsCompare` (scope + disclosure part)

## 1. Responsibilities

A **central** catalogue of insurers, products and immutable product versions (UIN, wording version, POSP eligibility, distributor-channel eligibility, effective dates, quote requirements, research summaries with source and date), maintained by the platform content team and **filtered per tenant at read time**. Owns the **Comparison Scope Engine** — the one pure function every module uses to decide which insurer-products a salesperson may show (quote, comparison, research library, AI assistant retrieval, Strapi product blocks).

## 2. Layout
```
apps/core/src/modules/catalogue/
  domain/
    insurer.ts, product.ts, product-version.ts     ProductVersion immutability (locked once quoted)
    research.ts                                   ResearchSummary + staleness
    comparison-scope.ts                           ComparisonScopeEngine (pure), ScopeInput, ScopeResult, disclosureFor()
    eligibility-filters.ts                        ScopeFilter chain (Chain of Responsibility / Specification)
  application/
    ports.ts, catalogue-admin.service.ts, catalogue-query.service.ts, comparison-scope.service.ts (facade: gathers inputs from M01/M02 and calls the engine)
  infrastructure/   in-memory + pg repositories (platform scope, no RLS), seed.ts (demo catalogue)
  api/              catalogue.controller.ts, catalogue-admin.controller.ts, schemas.ts
  catalogue.module.ts
apps/core/migrations/050_catalogue.sql
apps/web/src/features/catalogue/
```

## 3. Domain model

```ts
export type LineOfBusiness = 'LIFE' | 'HEALTH' | 'GENERAL';
export type DistributorChannel = 'IMF' | 'BROKER' | 'INDIVIDUAL_AGENT' | 'CORPORATE_AGENT';   // = M01 EntityType
export interface Insurer { id: string; name: string; irdaiRegNo: string; lines: LineOfBusiness[]; active: boolean }
export interface Product { id: string; insurerId: string; line: LineOfBusiness; name: string; category: 'TERM' | 'SAVINGS' | 'ULIP' | 'PENSION' | 'CHILD' | 'HEALTH_INDIVIDUAL' | 'HEALTH_FLOATER' | 'STANDARD_HEALTH' | 'MOTOR' | 'OTHER' }
export type VersionStatus = 'draft' | 'active' | 'withdrawn';
export interface ProductVersionProps {
  id: string; productId: string; insurerId: string; line: LineOfBusiness; uin: string; wordingVersion: string; wordingUrl?: string;
  posEligible: boolean; channels: DistributorChannel[]; effectiveFrom: string; effectiveTo?: string;
  status: VersionStatus; lockedAt?: string; quoteRequirements: string[] /* canonical question keys (M09) */;
  keyFacts: Array<{ label: string; value: string }>;       // waiting periods, room rent, co-pay… for comparison grids
}
export class ProductVersion {
  static draft(p: Omit<ProductVersionProps, 'status' | 'lockedAt'>): ProductVersion   // uin /^[A-Z0-9]{6,30}$/ ; channels non-empty
  activate(): void            // draft → active
  withdraw(on: string): void  // active → withdrawn; effectiveTo = on
  lock(now: Date): void       // first quote locks; idempotent
  edit(patch: Partial<Pick<ProductVersionProps, 'keyFacts' | 'quoteRequirements' | 'wordingUrl' | 'channels' | 'posEligible'>>): void
  // locked → BusinessRuleError('product_version_locked') (HLD §8: immutable once quoted — create a new version instead)
  isEffective(date: string): boolean   // active && effectiveFrom <= date && (!effectiveTo || date <= effectiveTo)
}
export interface ResearchSummary { versionId: string; summary: string; points: string[]; sourceRef: string; sourceDate: string; reviewedWordingVersion: string; reviewedAt: string }
export function isStale(summary: ResearchSummary, version: ProductVersionProps, today: Date): { stale: boolean; reason?: 'wording_changed' | 'older_than_365_days' }
```

### 3.1 Comparison Scope Engine (F78, LA-6) — pure, single implementation
```ts
export interface ScopeInput {
  entityType: DistributorChannel;                         // M01 distributor entity
  comparisonScope: 'MARKET_WIDE' | 'TIED_INSURERS';      // M01 (BROKER → MARKET_WIDE)
  tiedInsurerIds: Record<LineOfBusiness, string[]>;      // M01 active tie-ups on `date`
  salesperson: { type: 'EMPLOYEE' | 'ISP' | 'POSP' | 'SOLO'; lines: LineOfBusiness[] };   // M02 selling scope
  line?: LineOfBusiness; category?: Product['category'];
  date: string;                                           // YYYY-MM-DD
}
export interface ScopedVersion { versionId: string; productId: string; insurerId: string; line: LineOfBusiness }
export interface ScopeResult { versions: ScopedVersion[]; insurerIds: string[]; excluded: Array<{ versionId: string; reason: ScopeExclusion }>; disclosure: string }
export type ScopeExclusion = 'not_effective' | 'channel_not_permitted' | 'insurer_not_tied' | 'not_pos_eligible' | 'line_not_licensed' | 'insurer_inactive' | 'filtered_out';
export interface ScopeFilter { readonly reason: ScopeExclusion; allows(v: ProductVersionProps, insurer: Insurer, input: ScopeInput): boolean }
export const EffectiveFilter, InsurerActiveFilter, ChannelFilter, TieUpFilter, PosEligibilityFilter, LicensedLineFilter, RequestFilter: ScopeFilter
export class ComparisonScopeEngine {
  constructor(filters?: ScopeFilter[])   // default order as listed; first failing filter gives the exclusion reason
  evaluate(input: ScopeInput, catalogue: { versions: ProductVersionProps[]; insurers: Insurer[] }): ScopeResult
}
export function disclosureFor(input: ScopeInput, insurerNames: string[]): string
```
Filter rules:
- `ChannelFilter`: `version.channels` includes `input.entityType`.
- `TieUpFilter`: when `comparisonScope === 'TIED_INSURERS'`, insurer must be in `tiedInsurerIds[version.line]`; MARKET_WIDE passes all.
- `PosEligibilityFilter`: salesperson type POSP → `version.posEligible`.
- `LicensedLineFilter`: version line ∈ `salesperson.lines`.
- `RequestFilter`: optional `line`/`category` narrowing (reason `filtered_out`).

Disclosure texts (wireframe M08, exact):
- IMF / CORPORATE_AGENT: `Showing plans from your tied insurers only: <names>. This disclosure appears on shared comparisons.`
- BROKER: `Broker view: comparing across all configured insurers (<names>). Advice is documented in the advice record.`
- POSP salesperson (any entity): `POSP view: only POSP-eligible products are shown. Other plans need an ISP or employee salesperson.`
- INDIVIDUAL_AGENT: `Agent view: only your appointing insurer for this line is shown (one insurer per line today; limits are configurable).`
Names are sorted alphabetically and joined with `, `; an empty list renders as `none configured`.

## 4. Ports and services
```ts
export interface CatalogueRepository {            // platform scope
  insurers(): Promise<Insurer[]>; saveInsurer(i: Insurer): Promise<void>
  products(filter?: { insurerId?: string; line?: LineOfBusiness }): Promise<Product[]>; saveProduct(p: Product): Promise<void>
  versions(filter?: { productId?: string; status?: VersionStatus }): Promise<ProductVersionProps[]>
  getVersion(id: string): Promise<ProductVersion | undefined>; saveVersion(v: ProductVersion): Promise<void>
  research(versionIds: string[]): Promise<ResearchSummary[]>; saveResearch(r: ResearchSummary): Promise<void>
}
export interface ScopeInputsProvider { inputsFor(tx: Transaction, principal: Principal, date: string): Promise<Omit<ScopeInput, 'line' | 'category'>> }   // uses M01 TenantSettings/TieUpReader + M02 SellerDirectory.sellingScope
export interface ComparisonScopeFacade {          // published for M06, M13, M14
  scopeFor(tx: Transaction, principal: Principal, opts: { line?: LineOfBusiness; category?: Product['category']; date: string }): Promise<ScopeResult>
  assertInScope(tx: Transaction, principal: Principal, versionId: string, date: string): Promise<void>   // ForbiddenError('product_out_of_scope', details.reason)
}
```
| Service | Behaviour |
|---|---|
| `CatalogueAdminService` (operator, workforce realm, permission `ops.catalogue.write`) | upsert insurers/products; create draft version; activate; withdraw; edit (locked → 422); add research summary; audit + events `catalogue.product_version.activated/withdrawn`, `catalogue.research.updated` |
| `CatalogueQueryService` | `catalogueForTenant(principal, filters)` → products within scope with `isp`/`posp` flags, wording version, status and `inScope` + exclusion reason (W07 table shows all tie-up insurers' products); `research(principal, filters)` → only in-scope versions with summary + stale flag (M07) |
| `ComparisonScopeService implements ComparisonScopeFacade` | gathers inputs, runs engine, metrics `catalogue_scope_evaluations_total{entity_type}`, debug log of exclusion counts (no PII) |
| `ProductVersionLocker` (subscriber) | `quote.option.created` → `lock` the version (M06) |

## 5. API (`/api/v1`)
| Method | Path | Permission | Response |
|---|---|---|---|
| GET | `/catalogue/products?line=&category=&insurerId=` | `catalogue.read` | `{ items: [{ versionId, productId, productName, insurerId, insurerName, line, category, uin, wordingVersion, ispEligible: boolean, posEligible, status, inScope, exclusion? }] }` |
| POST | `/catalogue/comparison-scopes/evaluations` | `catalogue.read` | body `{ line?, category?, date? }` → `ScopeResult` with insurer/product names |
| GET | `/catalogue/research?line=&q=` | `catalogue.read` | `{ items: [{ versionId, productName, insurerName, line, posEligible, summary, points, sourceRef, sourceDate, stale, staleReason? }] }` |
| GET | `/catalogue/versions/{id}` | `catalogue.read` + in scope | version detail with keyFacts and wording link (404 when out of scope) |
| POST/PUT | `/ops/catalogue/insurers`, `/ops/catalogue/products`, `/ops/catalogue/versions`, `/ops/catalogue/versions/{id}/activation`, `/ops/catalogue/versions/{id}/withdrawal`, `/ops/catalogue/versions/{id}/research` | operator | admin writes (idempotent POSTs) |

`catalogue.read` is granted to every customer-realm role.

## 6. DDL — `050_catalogue.sql` (platform scope: no tenant_id, no RLS; iap_app SELECT only)
```sql
create table if not exists insurer (id text primary key, name text not null, irdai_reg_no text not null, lines text[] not null, active boolean not null default true);
create table if not exists product (id text primary key, insurer_id text not null references insurer(id), line text not null, name text not null, category text not null);
create table if not exists product_version (
  id text primary key, product_id text not null references product(id), insurer_id text not null references insurer(id), line text not null,
  uin text not null, wording_version text not null, wording_url text, pos_eligible boolean not null, channels text[] not null,
  effective_from date not null, effective_to date, status text not null check (status in ('draft','active','withdrawn')),
  locked_at timestamptz, quote_requirements text[] not null default '{}', key_facts jsonb not null default '[]',
  unique (product_id, wording_version)
);
create table if not exists research_summary (version_id text primary key references product_version(id), summary text not null, points jsonb not null, source_ref text not null, source_date date not null, reviewed_wording_version text not null, reviewed_at timestamptz not null);
```

## 7. Frontend
| Route | Screen | Behaviour |
|---|---|---|
| `/console/tenant` (catalogue tab) | `CatalogueTable` inside W07 | "Only products of active tie-ups are saleable"; line chips; table Product, Insurer, Line, UIN, ISP ✓, POSP ✓/–, Wording, Status (in scope / not tied / withdrawn chips) |
| `/m/research` | `ResearchLibraryScreen` (M07 library) | "Approved content for your tied insurers only"; line chips; cards with POSP-eligible chip, points, source and date; stale banner "Insurer updated the wording … quote from the wording only."; "Compare" → `/m/compare?line=`; assistant tab shows "Coming in a later module" |
| `/m/compare` | `CompareScreen` (M08 scope part) | plan cards for in-scope versions with key facts; disclosure text from the API shown above the cards and stated as "appears on shared comparisons"; select a plan; quotes and advice record arrive in M06 |

## 8. Acceptance criteria
- **AC-M05-01** `ProductVersion` lifecycle draft→active→withdrawn; locked versions reject edits with `product_version_locked`; `isEffective` honours dates and status.
- **AC-M05-02** Scope engine (LA-6): an IMF ISP sees only tied insurers' versions for the line; a broker sees every channel-permitted insurer; a POSP sees only POS-eligible versions; an individual agent sees only the appointing insurer; each exclusion carries the first failing reason.
- **AC-M05-03** Versions not effective on the date, of inactive insurers, not permitted for the channel or outside the salesperson's licensed lines are excluded.
- **AC-M05-04** Disclosure texts match the wireframe exactly per persona, with alphabetically sorted insurer names.
- **AC-M05-05** `assertInScope` rejects an out-of-scope version with 403 `product_out_of_scope` and its reason; version detail returns 404 when out of scope.
- **AC-M05-06** Research items include source and date, flag stale summaries when the wording version changed or the review is older than 365 days, and only include in-scope versions.
- **AC-M05-07** Catalogue admin is operator-only; tenant users cannot write; first quote locks the version (event subscriber).
- **AC-M05-08** Tenant catalogue table marks products of non-tied insurers as not in scope (tenant isolation of tie-ups: tenant B's tie-ups never affect tenant A).
- **AC-M05-09** Postgres: catalogue tables readable, not writable, by `iap_app`. *(integration)*
- **AC-M05-10** Compare screen shows only API-returned plans and the persona disclosure; research screen shows stale banner and POSP chip; catalogue table shows scope chips.
