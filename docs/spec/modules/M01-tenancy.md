# M01 · Tenant & Entitlements — low-level design

Status: Ready for build · Depends on: M00 · Requirements: Rev 3.0 §1 (Distributor Entity), §2 (plans, white-label), §17 (F94, F95, F99), §18 (tie-ups, rebating, online solicitation) · HLD §7 (Tenant & Entitlements), §10 (multi-tenancy, provisioning saga) · Screens: W07 `TenantSetup`, W09 `OperatorTenants`, W08 `WhiteLabel` (brand-kit part), M15 `SoloSignup`, M19 `SoloPlan`

## 1. Responsibilities

Owns: tenant directory (tenant, domains, status, cell, CRM mode), distributor entity and registration, plan catalogue and entitlements, tie-ups per line with limits as data, feature flags including legally gated capabilities, brand kit, usage metering (F99), the provisioning saga, solo self-signup (F94). Publishes the `TenantResolver` used by the kernel AuthGuard (replaces `StaticTenantResolver` when `persistence` is `pg` or when seeded in memory).

Does not own: users and roles (M02), product catalogue (M05 consumes `TieUpReader`), content rendering of the brand (M14), billing collection (billing provider, later).

## 2. Module layout

```
apps/core/src/modules/tenancy/
  domain/
    tenant.ts                 Tenant aggregate + TenantStatus state machine (State)
    distributor-entity.ts     DistributorEntity value object
    tenant-domain.ts          TenantHost value object + DomainVerification
    plan.ts                   Plan, PlanLimits, PlanCatalogue
    tie-up.ts                 TieUp, TieUpSet, TieUpLimitPolicy, TieUpLimitSpecification (Specification)
    feature-flags.ts          FeatureFlag, GatedCapability, FeatureFlagSet
    brand-kit.ts              BrandKit, contrastRatio(), APPROVED_TYPEFACES
    usage.ts                  UsageCounter, UsageMeter (threshold crossing)
    signup.ts                 SoloSignup aggregate (OTP state)
    events.ts                 event type constants + payload types
  application/
    ports.ts                  repositories + external ports (interfaces, DI tokens)
    provision-tenant.service.ts
    provisioning-saga.ts      ProvisioningSaga + ProvisioningStep (Command) implementations
    tenant-query.service.ts
    tie-up.service.ts
    feature-flag.service.ts
    brand-kit.service.ts
    usage.service.ts          also implements EntitlementChecker facade
    solo-signup.service.ts
    directory-tenant-resolver.ts   implements kernel TenantResolver (+ CachingTenantResolver decorator)
  infrastructure/
    in-memory-tenancy.repositories.ts
    pg-tenancy.repositories.ts
    stub-provisioners.ts      StubIdentityProvisioner, StubCrmProvisioner, StubContentProvisioner, LoggingOtpSender
    seed.ts                   plan catalogue + tie-up limits seed data
  api/
    schemas.ts                zod request/response schemas
    operator-tenants.controller.ts
    tenant.controller.ts
    public-tenant.controller.ts
  tenancy.module.ts
apps/core/migrations/010_tenancy.sql
apps/web/src/features/tenancy/
```

## 3. Domain model

### 3.1 Tenant aggregate (State pattern for status)
```ts
export type TenantKind = 'ORGANISATION' | 'SOLO';
export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'offboarded';
export type CrmMode = 'solo_lite' | 'twenty';
export type PlanCode = 'SOLO' | 'SOLO_PRO' | 'TEAM' | 'BUSINESS' | 'WHITE_LABEL' | 'DEDICATED';

export interface TenantProps {
  id: string; slug: string; displayName: string; kind: TenantKind; status: TenantStatus;
  planCode: PlanCode; trialEndsAt?: string; cell: string; deploymentMode: 'pooled' | 'dedicated';
  crmMode: CrmMode; createdAt: string; version: number;
}
export class Tenant {
  static create(input: { id: string; slug: string; displayName: string; kind: TenantKind; planCode: PlanCode; cell?: string; now: Date }): Tenant
  // slug /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/ else ValidationError('invalid_slug')
  // SOLO kind requires plan SOLO or SOLO_PRO; ORGANISATION requires TEAM/BUSINESS/WHITE_LABEL/DEDICATED → else BusinessRuleError('plan_not_allowed_for_kind')
  // crmMode = kind === 'SOLO' ? 'solo_lite' : 'twenty' (HLD §10); deploymentMode = plan DEDICATED ? 'dedicated' : 'pooled'; cell default 'cell-1'; status 'provisioning'
  static restore(props: TenantProps): Tenant
  readonly props: Readonly<TenantProps>
  activate(): void            // provisioning|suspended → active
  suspend(): void             // active → suspended
  offboard(): void            // active|suspended → offboarded
  changePlan(plan: PlanCode): void   // same kind rule; not allowed when offboarded
  startTrial(plan: 'SOLO_PRO', endsAt: Date): void  // only SOLO tenants on SOLO; sets trialEndsAt; plan becomes SOLO_PRO
  // illegal transition → BusinessRuleError('illegal_tenant_transition', …, { from, to })
}
```
Transition table (State): `provisioning→active`, `active→suspended`, `suspended→active`, `active→offboarded`, `suspended→offboarded`. Everything else is illegal.

### 3.2 DistributorEntity (Rev 3.0 §1)
```ts
export type EntityType = 'IMF' | 'BROKER' | 'INDIVIDUAL_AGENT' | 'CORPORATE_AGENT';
export class DistributorEntity {
  static create(input: { tenantKind: TenantKind; entityType: EntityType; legalName: string; registrationNo: string; registrationValidTo: string /* YYYY-MM-DD */; principalOfficerName?: string }): DistributorEntity
  // SOLO ⇔ INDIVIDUAL_AGENT (BusinessRuleError('entity_type_not_allowed_for_kind')); legalName 2..200; registrationNo 3..40 [A-Z0-9/-]
  // PRINCIPAL_OFFICER required for IMF and BROKER (ValidationError('principal_officer_required'))
  readonly entityType: EntityType; readonly legalName: string; readonly registrationNo: string; readonly registrationValidTo: string; readonly principalOfficerName?: string
  registrationStatus(today: Date): 'valid' | 'expiring' | 'expired'   // expiring = within 60 days
  comparisonScope(): 'MARKET_WIDE' | 'TIED_INSURERS'                  // BROKER → MARKET_WIDE; others TIED_INSURERS (F78; POSP narrowing is M05)
}
```

### 3.3 Plans (configuration as data)
```ts
export type Capability = 'CRM' | 'QUOTE_TO_SALE' | 'BOOK' | 'RESEARCH' | 'PRODUCTIVITY' | 'AI' | 'HIERARCHY' | 'CMS_PORTAL' | 'MICROSITE' | 'COMMISSION' | 'WHITE_LABEL_BRAND' | 'CUSTOM_DOMAIN' | 'DATA_EXPORT';
export type UsageMetric = 'seats' | 'customers' | 'ai_credits' | 'messages';
export interface PlanLimits { seats: number | null; customers: number | null; ai_credits: number | null; messages: number | null; customFields: number }   // null = unlimited
export interface Plan { code: PlanCode; name: string; kind: TenantKind; stage: 'L' | 'L_BETA' | 'N'; capabilities: ReadonlySet<Capability>; limits: PlanLimits; alertThresholdPct: number; canHidePoweredBy: boolean }
export class PlanCatalogue {
  constructor(plans: Plan[])
  get(code: PlanCode): Plan                        // unknown → NotFoundError('plan')
  list(): Plan[]
  static default(): PlanCatalogue                  // seed below
}
```
Seed (`infrastructure/seed.ts`, mirrored by migration inserts; values are pilot hypotheses):

| Code | Kind | Capabilities | Limits (seats/customers/ai/messages) | Alert % | Hide powered-by |
|---|---|---|---|---|---|
| SOLO | SOLO | CRM, QUOTE_TO_SALE, BOOK, RESEARCH, PRODUCTIVITY, AI, MICROSITE, COMMISSION, DATA_EXPORT | 1 / 500 / 100 / 0 | 75 | no |
| SOLO_PRO | SOLO | same as SOLO | 1 / null / 1000 / 500 | 75 | no |
| TEAM | ORGANISATION | CRM, QUOTE_TO_SALE, BOOK, RESEARCH, PRODUCTIVITY, AI, HIERARCHY, MICROSITE, COMMISSION, DATA_EXPORT | 25 / null / 2000 / 5000 | 75 | no |
| BUSINESS | ORGANISATION | TEAM + CMS_PORTAL, CUSTOM_DOMAIN | 200 / null / 10000 / 25000 | 90 | no |
| WHITE_LABEL | ORGANISATION | BUSINESS + WHITE_LABEL_BRAND | 500 / null / 20000 / 50000 | 90 | yes |
| DEDICATED | ORGANISATION | WHITE_LABEL | null / null / null / null | 90 | yes |

### 3.4 Tie-ups (limits as data — Rev 3.0 §18)
```ts
export type LineOfBusiness = 'LIFE' | 'HEALTH' | 'GENERAL';
export interface TieUp { insurerId: string; line: LineOfBusiness; effectiveFrom: string; effectiveTo?: string }
export interface TieUpLimit { entityType: EntityType; line: LineOfBusiness; maxInsurers: number | null }   // null = market-wide
export class TieUpLimitPolicy {
  constructor(limits: TieUpLimit[])
  maxFor(entityType: EntityType, line: LineOfBusiness): number | null   // missing row → 0 (deny by default)
  static default(): TieUpLimitPolicy   // IMF 6 per line; CORPORATE_AGENT 9; INDIVIDUAL_AGENT 1; BROKER null
}
export class TieUpSet {
  constructor(tieUps: TieUp[])
  activeOn(date: string, line?: LineOfBusiness): TieUp[]          // effectiveFrom <= date && (!effectiveTo || date <= effectiveTo)
  insurersFor(line: LineOfBusiness, date: string): string[]
  validate(entityType: EntityType, policy: TieUpLimitPolicy): void
  // → ValidationError('tie_up_dates_invalid') when effectiveTo < effectiveFrom
  // → ValidationError('tie_up_overlap') when the same insurer+line has overlapping periods
  // → BusinessRuleError('tie_up_limit_exceeded', …, { line, max, found }) when on any date the number of distinct active insurers in a line exceeds maxFor (check at every effectiveFrom boundary)
}
export class TieUpLimitSpecification extends Specification<{ entityType: EntityType; tieUps: TieUpSet }> // isSatisfiedBy = validate() does not throw
```

### 3.5 Feature flags and gated capabilities
```ts
export type FeatureFlagKey = 'online_purchase' | 'referral_rewards' | 'ai_skills' | 'whatsapp_api' | 'book_import_ai' | 'twenty_ui';
export interface FeatureFlag { key: FeatureFlagKey; enabled: boolean; gate?: { kind: 'COMPLIANCE_REVIEW' | 'LEGAL_LOCK'; reason: string; reviewRef?: string; reviewedAt?: string } }
export class FeatureFlagSet {
  static defaults(): FeatureFlagSet   // all disabled; online_purchase gate COMPLIANCE_REVIEW (ISNP rules, Rev 3.0 §18); referral_rewards gate LEGAL_LOCK 'Rebates and inducements to policyholders are prohibited (Insurance Act s.41)'
  get(key: FeatureFlagKey): FeatureFlag
  recordComplianceReview(key: FeatureFlagKey, reviewRef: string, at: Date): void   // only COMPLIANCE_REVIEW gates; stores ref
  enable(key: FeatureFlagKey): void
  // LEGAL_LOCK → BusinessRuleError('feature_legally_locked'); COMPLIANCE_REVIEW without reviewRef → BusinessRuleError('compliance_review_required')
  disable(key: FeatureFlagKey): void
  list(): FeatureFlag[]
}
```

### 3.6 Brand kit (F95)
```ts
export const APPROVED_TYPEFACES = ['IBM Plex Sans', 'Noto Sans', 'Mukta'] as const;   // Indic-ready set
export function contrastRatio(hexA: string, hexB: string): number   // WCAG 2.1 relative luminance; '#RRGGBB'
export interface BrandKitProps { brandName: string; primary: string; secondary: string; typeface: typeof APPROVED_TYPEFACES[number]; logoRef?: string; poweredByVisible: boolean }
export class BrandKit {
  static create(props: BrandKitProps, plan: Plan): BrandKit
  // hex colours /^#[0-9A-Fa-f]{6}$/ else ValidationError('invalid_colour')
  // contrastRatio(primary, '#FFFFFF') < 4.5 → BusinessRuleError('brand_contrast_insufficient', …, { ratio })
  // typeface not approved → ValidationError('typeface_not_approved')
  // poweredByVisible === false and !plan.canHidePoweredBy → BusinessRuleError('powered_by_required')
  static platformDefault(): BrandKit     // brandName 'Insurance Distribution Platform', primary '#1F5FBF', secondary '#163F7F', IBM Plex Sans, visible
  readonly props: Readonly<BrandKitProps>
}
```

### 3.7 Usage metering (F99)
```ts
export interface UsageCounter { metric: UsageMetric; period: string /* YYYY-MM */; used: number; limit: number | null; alertedAt?: string }
export type ConsumeResult = { allowed: true; counter: UsageCounter; crossedThreshold: boolean } | { allowed: false; counter: UsageCounter };
export class UsageMeter {
  static consume(counter: UsageCounter, amount: number, alertThresholdPct: number, now: Date): ConsumeResult
  // amount must be a positive integer (ValidationError('invalid_amount'))
  // limit null → allowed; used + amount > limit → { allowed: false } (counter unchanged)
  // crossedThreshold true exactly once per period: when used goes from < threshold to >= threshold and alertedAt is unset (then alertedAt = now)
  static percentUsed(counter: UsageCounter): number | null   // rounded integer
}
```

### 3.8 Solo signup (F94)
```ts
export type SignupState = 'otp_sent' | 'verified' | 'expired' | 'locked';
export class SoloSignup {
  static start(input: { id: string; phone: PhoneNumber; displayName: string; licence: { insurerName: string; line: LineOfBusiness; licenceNo: string }; consentNoticeVersion: string; otpHash: string; now: Date }): SoloSignup
  // expiresAt = now + 10 min; attempts = 0
  verify(otpHash: string, now: Date): void
  // expired → BusinessRuleError('otp_expired') and state 'expired'; mismatch → attempts++ → BusinessRuleError('otp_invalid'); 5th failed attempt → state 'locked' and BusinessRuleError('otp_locked'); success → 'verified'
  // verifying a non-otp_sent signup → BusinessRuleError('signup_not_pending')
  readonly state: SignupState; readonly id: string; readonly tenantId?: string
  attachTenant(tenantId: string): void
}
export function hashOtp(otp: string, pepper: string): string   // HMAC-SHA256 hex; raw OTP never stored or logged
```

## 4. Ports (application/ports.ts)

```ts
export interface TenantDirectory {                         // platform-scope (not RLS): operator + resolver
  findById(id: string): Promise<Tenant | undefined>
  findBySlug(slug: string): Promise<Tenant | undefined>
  findByHost(host: string): Promise<{ tenant: Tenant; host: TenantHostRecord } | undefined>
  list(filter: { status?: TenantStatus; kind?: TenantKind; cursor?: string; limit: number }): Promise<{ items: Tenant[]; nextCursor?: string }>
  save(tenant: Tenant): Promise<void>                      // optimistic: version mismatch → PreconditionFailedError
  addHost(record: TenantHostRecord): Promise<void>         // duplicate host → ConflictError('host_taken')
  listHosts(tenantId: string): Promise<TenantHostRecord[]>
}
export interface TenantHostRecord { tenantId: string; host: string; kind: 'platform_subdomain' | 'custom'; verificationToken?: string; verifiedAt?: string }
export interface TenantSettingsRepository {               // tenant-scoped (RLS)
  getEntity(tx: Transaction): Promise<DistributorEntity | undefined>
  saveEntity(tx: Transaction, e: DistributorEntity): Promise<void>
  getTieUps(tx: Transaction): Promise<TieUpSet>
  replaceTieUps(tx: Transaction, set: TieUpSet): Promise<void>
  getFlags(tx: Transaction): Promise<FeatureFlagSet>
  saveFlags(tx: Transaction, flags: FeatureFlagSet): Promise<void>
  getBrandKit(tx: Transaction): Promise<BrandKit | undefined>
  saveBrandKit(tx: Transaction, kit: BrandKit): Promise<void>
  getUsage(tx: Transaction, metric: UsageMetric, period: string): Promise<UsageCounter | undefined>
  saveUsage(tx: Transaction, counter: UsageCounter): Promise<void>
}
export interface ProvisioningStateRepository {
  completedSteps(tenantId: string): Promise<string[]>
  markCompleted(tenantId: string, step: string): Promise<void>
  markFailed(tenantId: string, step: string, error: string): Promise<void>
}
export interface SignupRepository { get(id: string): Promise<SoloSignup | undefined>; save(s: SoloSignup): Promise<void> }
export interface IdentityProvisioner { ensureOrganisation(tenantId: string, slug: string): Promise<void>; ensureAdmin(tenantId: string, admin: { name: string; phone?: string; email?: string }): Promise<string /* userRef */> }
export interface CrmProvisioner { ensureWorkspace(tenantId: string, mode: CrmMode): Promise<{ workspaceRef?: string }> }
export interface ContentProvisioner { ensureTenantScope(tenantId: string): Promise<void> }
export interface OtpSender { send(phone: PhoneNumber, otp: string): Promise<void> }   // Messaging Port later (HLD K4)
export interface OtpGenerator { generate(): string }                                  // 6 digits; FixedOtpGenerator for tests
export interface TieUpReader { activeInsurers(tenantId: string, line: LineOfBusiness, date: string): Promise<string[]> }   // for M05
export interface EntitlementChecker {                                                    // facade for other modules
  hasCapability(tenantId: string, capability: Capability): Promise<boolean>
  isFeatureEnabled(tenantId: string, key: FeatureFlagKey): Promise<boolean>
  consume(tenantId: string, metric: UsageMetric, amount: number): Promise<void>         // denied → RateLimitedError('usage_limit_exceeded', details { metric, limit })
  limitFor(tenantId: string, metric: UsageMetric): Promise<number | null>               // plan limit (null = unlimited); used by M02 seat checks
}
```
Tokens: `TENANT_DIRECTORY, TENANT_SETTINGS_REPOSITORY, PROVISIONING_STATE_REPOSITORY, SIGNUP_REPOSITORY, IDENTITY_PROVISIONER, CRM_PROVISIONER, CONTENT_PROVISIONER, OTP_SENDER, OTP_GENERATOR, PLAN_CATALOGUE, TIE_UP_LIMIT_POLICY, TIE_UP_READER, ENTITLEMENT_CHECKER, TENANCY_OPTIONS` (`{ platformDomain: string /* 'iap.test' in tests, 'iap.example' default */; otpPepper: string; cacheTtlMs: number /* 60000 */ }`).

## 5. Application services

### 5.1 ProvisionTenantService + ProvisioningSaga (Command pattern, HLD §10)
```ts
export interface ProvisionTenantInput { slug: string; displayName: string; kind: TenantKind; planCode: PlanCode; entity: { entityType: EntityType; legalName: string; registrationNo: string; registrationValidTo: string; principalOfficerName?: string }; admin: { name: string; phone?: string; email?: string } }
export class ProvisionTenantService {
  provision(input: ProvisionTenantInput): Promise<{ tenantId: string; status: TenantStatus; host: string; failedStep?: string }>
  // 1. slug unique (ConflictError('slug_taken'))  2. Tenant.create + DistributorEntity.create (validate before any write)
  // 3. directory.save(tenant) + addHost(`${slug}.${platformDomain}`, platform_subdomain, verifiedAt now)
  // 4. settings (in uow.run(tenantId)): saveEntity, saveFlags(defaults), saveBrandKit(platformDefault), outbox 'tenant.tenant.provisioning_started', audit 'tenant.provision'
  // 5. saga.run(tenant) → on success tenant.activate(), save, event 'tenant.tenant.provisioned'
  resume(tenantId: string): Promise<{ status: TenantStatus; failedStep?: string }>   // re-runs saga; completed steps are skipped
}
export interface ProvisioningStep { readonly name: string; execute(ctx: { tenant: Tenant; admin: ProvisionTenantInput['admin'] }): Promise<void> }
// Steps in order: 'identity.organisation' (IdentityProvisioner.ensureOrganisation), 'identity.admin' (ensureAdmin),
//                 'crm.workspace' (CrmProvisioner.ensureWorkspace(tenant.crmMode)), 'content.scope' (ContentProvisioner), 'smoke.check' (directory.findByHost resolves)
export class ProvisioningSaga {
  constructor(steps: ProvisioningStep[], state: ProvisioningStateRepository, logger: Logger)
  run(ctx): Promise<{ ok: true } | { ok: false; failedStep: string }>
  // skips completed steps; on failure markFailed, logger.warn('tenant.provisioning.step_failed', …, { step }), stop (tenant stays 'provisioning')
}
```
Steps are idempotent by contract (each provisioner uses `ensure*` semantics).

### 5.2 Other services
| Service | Methods | Rules |
|---|---|---|
| `TenantQueryService` | `profile(tenantId)` → `{ id, slug, displayName, kind, status, planCode, trialEndsAt?, crmMode, entity, registrationStatus, comparisonScope, hosts }`; `entitlements(tenantId)` → `{ plan: { code, name, capabilities[], limits }, usage: Array<UsageCounter & { percentUsed }>, flags: FeatureFlag[] }` for the current period; `listForOperator(filter)` | registrationStatus uses Clock |
| `TieUpService` | `get(tenantId)` → `{ lines: Array<{ line, max, active: TieUp[] }> }`; `replace(tenantId, tieUps: TieUp[])` | validate with entity type + `TieUpLimitPolicy`; event `tenant.tie_up.updated` `{ lines: { line, insurerIds[] }[] }`; audit `tenant.tie_ups.replace` |
| `FeatureFlagService` | `list`, `recordComplianceReview(key, reviewRef)`, `setEnabled(key, enabled)` | audit every change; event `tenant.feature_flag.changed`; security log `security.feature_flag.changed` |
| `BrandKitService` | `get(tenantId)`, `update(tenantId, props)` | plan from catalogue; event `tenant.brand_kit.updated` |
| `UsageService implements EntitlementChecker` | `hasCapability`, `isFeatureEnabled`, `limitFor` (plan capability AND flag where the flag maps to a capability: ai_skills→AI), `consume` | missing counter → created with plan limit; crossing → event `tenant.usage.threshold_crossed` `{ metric, percent, period }` + `logger.info`; denied → `RateLimitedError` |
| `OperatorTenantService` | `suspend(id)`, `resume(id)`, `changePlan(id, plan)` | operator-only; audit + events `tenant.tenant.suspended|resumed|plan_changed`; resolver cache invalidated |
| `SoloSignupService` | `start(input)` → `{ signupId, expiresAt }`; `verify(signupId, otp)` → `{ tenantId, host, status }` | `start`: phone parse, rate limit 3 starts per phone per hour (`RateLimitedError('signup_rate_limited')`), OTP via `OtpGenerator`, `OtpSender.send`, store hash only. `verify`: on success provisions a SOLO tenant (`slug` = `agent-` + last 4 digits + 4 random base32 chars, plan SOLO, entity INDIVIDUAL_AGENT with registrationNo = licenceNo, registrationValidTo = today + 1 year placeholder pending verification), event `tenant.signup.verified` (no phone in payload). Licence verification itself is an external provider (later); status `pending_verification` returned in `licenceStatus`. |

### 5.3 DirectoryTenantResolver (implements kernel `TenantResolver`)
```ts
export class DirectoryTenantResolver implements TenantResolver { constructor(directory: TenantDirectory) }    // unverified custom hosts never resolve
export class CachingTenantResolver implements TenantResolver {                                              // Decorator
  constructor(inner: TenantResolver, clock: Clock, ttlMs: number)
  invalidate(host?: string): void                                                                          // all when host omitted
}
```
`TenancyModule` overrides the kernel `TENANT_RESOLVER` provider with `CachingTenantResolver(DirectoryTenantResolver)`. In memory mode the directory is seeded from `config.staticTenants` so existing kernel tests keep working.

## 6. API (all under `/api/v1`; ✱ = `@Idempotent()`)

### 6.1 Operator (`@OperatorOnly()`)
| Method | Path | Request | Response |
|---|---|---|---|
| POST ✱ | `/ops/tenants` | `ProvisionTenantInput` | 201 `{ tenantId, status, host, failedStep? }` (status `active`, or `provisioning` with `failedStep`) |
| GET | `/ops/tenants?status=&kind=&limit=&cursor=` | — | `{ items: TenantSummary[], nextCursor? }`; `TenantSummary = { id, slug, displayName, kind, status, planCode, cell, entityType?, createdAt }` |
| POST ✱ | `/ops/tenants/{id}/provisioning-resumptions` | — | 200 `{ status, failedStep? }` |
| POST ✱ | `/ops/tenants/{id}/status-transitions` | `{ to: 'suspended' \| 'active' \| 'offboarded', reason: string(3..200) }` | 200 `TenantSummary` |
| PATCH | `/ops/tenants/{id}` | `{ planCode }` + `If-Match: "v<n>"` | 200 `TenantSummary` |
| GET | `/ops/plans` | — | `{ items: PlanView[] }` (`capabilities` as sorted array) |

### 6.2 Tenant (authenticated, host-resolved tenant)
| Method | Path | Permission | Request / Response |
|---|---|---|---|
| GET | `/tenant` | `tenant.read` | profile (§5.2) |
| GET | `/tenant/entitlements` | `tenant.read` | entitlements (§5.2) |
| GET | `/tenant/tie-ups` | `tenant.read` | `{ entityType, comparisonScope, lines: [{ line, max, active: TieUp[] }] }` |
| PUT | `/tenant/tie-ups` | `tenant.tie_up.write` | `{ tieUps: TieUp[] }` (max 60) → same shape as GET |
| GET | `/tenant/feature-flags` | `tenant.read` | `{ items: FeatureFlag[] }` |
| POST ✱ | `/tenant/feature-flags/{key}/compliance-reviews` | `tenant.flag.write` | `{ reviewRef: string(3..80) }` → `FeatureFlag` |
| PUT | `/tenant/feature-flags/{key}` | `tenant.flag.write` | `{ enabled: boolean }` → `FeatureFlag` (422 `feature_legally_locked` / `compliance_review_required`) |
| GET | `/tenant/brand-kit` | `tenant.read` | `BrandKitProps & { contrastRatio: number }` |
| PUT | `/tenant/brand-kit` | `tenant.brand.write` | `BrandKitProps` → same as GET |
| POST ✱ | `/tenant/trials` | `tenant.plan.write` | `{ planCode: 'SOLO_PRO' }` → profile (trial 14 days) |

### 6.3 Public (`@Public()`, tenant from host where applicable)
| Method | Path | Request / Response |
|---|---|---|
| GET | `/public/tenant-config` | `{ displayName, brand: { brandName, primary, secondary, typeface, logoRef?, poweredByVisible }, languages: ['en','hi'] }`; unknown host → 404 |
| POST ✱ | `/public/solo-signups` | `{ phone, displayName(2..80), licence: { insurerName, line, licenceNo }, consent: { noticeVersion, accepted: true } }` → 201 `{ signupId, expiresAt }`; `accepted !== true` → 400 |
| POST ✱ | `/public/solo-signups/{id}/verifications` | `{ otp: /^\d{6}$/ }` → 200 `{ tenantId, host, status: 'active', licenceStatus: 'pending_verification' }` |

Idempotency on public routes uses tenant scope `'public'` (kernel rule).

### 6.4 Permissions registered by the module
`TENANT_ADMIN → tenant.read, tenant.tie_up.write, tenant.flag.write, tenant.brand.write, tenant.plan.write` · `PRINCIPAL_OFFICER → tenant.read, tenant.tie_up.write, tenant.flag.write` · `SOLO_OWNER → tenant.read, tenant.brand.write, tenant.plan.write` · all other customer-realm roles → `tenant.read`.

## 7. DDL — `apps/core/migrations/010_tenancy.sql`

```sql
-- Platform-scope directory tables (no RLS; iap_app may only SELECT; writes via operator service using the owner pool)
create table if not exists tenant (
  id text primary key, slug text not null unique, display_name text not null,
  kind text not null check (kind in ('ORGANISATION','SOLO')),
  status text not null check (status in ('provisioning','active','suspended','offboarded')),
  plan_code text not null, trial_ends_at timestamptz, cell text not null default 'cell-1',
  deployment_mode text not null check (deployment_mode in ('pooled','dedicated')),
  crm_mode text not null check (crm_mode in ('solo_lite','twenty')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version int not null default 1
);
create table if not exists tenant_host (
  host text primary key, tenant_id text not null references tenant(id),
  kind text not null check (kind in ('platform_subdomain','custom')), verification_token text, verified_at timestamptz
);
create table if not exists tie_up_limit (
  entity_type text not null, line text not null, max_insurers int, effective_from date not null default '2024-01-01',
  primary key (entity_type, line, effective_from)
);
create table if not exists provisioning_step (
  tenant_id text not null references tenant(id), step text not null, status text not null check (status in ('completed','failed')),
  error text, updated_at timestamptz not null default now(), primary key (tenant_id, step)
);
create table if not exists solo_signup (
  id text primary key, phone_hash text not null, display_name text not null, licence jsonb not null,
  consent_notice_version text not null, otp_hash text not null, state text not null, attempts int not null default 0,
  expires_at timestamptz not null, tenant_id text references tenant(id), created_at timestamptz not null default now()
);
comment on column solo_signup.display_name is 'P2';

-- Tenant-scoped (RLS)
create table if not exists distributor_entity (
  tenant_id text primary key references tenant(id),
  entity_type text not null check (entity_type in ('IMF','BROKER','INDIVIDUAL_AGENT','CORPORATE_AGENT')),
  legal_name text not null, registration_no text not null, registration_valid_to date not null, principal_officer_name text,
  updated_at timestamptz not null default now()
);
create table if not exists tie_up (
  tenant_id text not null references tenant(id), insurer_id text not null, line text not null check (line in ('LIFE','HEALTH','GENERAL')),
  effective_from date not null, effective_to date, primary key (tenant_id, insurer_id, line, effective_from)
);
create table if not exists tenant_feature_flag (
  tenant_id text not null references tenant(id), key text not null, enabled boolean not null default false, gate jsonb,
  primary key (tenant_id, key)
);
create table if not exists brand_kit (
  tenant_id text primary key references tenant(id), brand_name text not null, primary_colour char(7) not null,
  secondary_colour char(7) not null, typeface text not null, logo_ref text, powered_by_visible boolean not null default true
);
create table if not exists usage_counter (
  tenant_id text not null references tenant(id), metric text not null, period char(7) not null, used int not null default 0,
  limit_value int, alerted_at timestamptz, primary key (tenant_id, metric, period)
);
-- RLS on distributor_entity, tie_up, tenant_feature_flag, brand_kit, usage_counter: policy tenant_isolation as in 000_kernel
-- grants: iap_app SELECT on tenant, tenant_host, tie_up_limit; SELECT/INSERT/UPDATE/DELETE on tenant-scoped tables
-- seed tie_up_limit: IMF 6, CORPORATE_AGENT 9, INDIVIDUAL_AGENT 1, BROKER null for LIFE/HEALTH/GENERAL
```
The `pg` adapters: `PgTenantDirectory` and `PgProvisioningStateRepository`/`PgSignupRepository` use the platform (owner) pool injected as `PLATFORM_POOL`; `PgTenantSettingsRepository` uses `PgTransaction` from the kernel unit of work (RLS).

## 8. Observability

| Event / metric | Level | Notes |
|---|---|---|
| `tenant.provisioning.step_failed` | warn | `{ step }` |
| `tenant.tenant.provisioned` / `suspended` / `resumed` / `plan_changed` | info + domain event | |
| `tenant.usage.threshold_crossed` | info + domain event | `{ metric, percent }` |
| `security.feature_flag.changed` | security | `{ key, enabled }` |
| `tenancy_resolver_cache_total{result="hit"\|"miss"}` | counter | resolver decorator |
| `tenant_usage_denied_total{metric}` | counter | |
| Signup: phone never logged; OTP never logged (assert in tests) | — | `LoggingOtpSender` logs `{ phone: masked }` only at debug |

## 9. Frontend (apps/web/src/features/tenancy)

API client functions in `api.ts` typed from §6. Screens (route → wireframe):

| Route | Screen | Behaviour to implement |
|---|---|---|
| `/console/tenant` | `TenantSetupScreen` (W07) | Entity card (type, registration no., valid-until with expiring/expired chip, Principal Officer), comparison-scope sentence (`MARKET_WIDE` → "Market-wide comparison across configured insurers", else "Only tied insurers"); tie-ups per line with "used / max" counter, add/remove insurer (free-text insurer id at this stage), Save → PUT; 422 `tie_up_limit_exceeded` shown inline on the line; gated capabilities: online purchase (record compliance review → enable), referral rewards locked with the legal text and disabled switch. |
| `/console/brand` | `BrandKitScreen` (W08 brand part) | Brand name, presets, primary/secondary colour inputs with live contrast check (client-side `contrastRatio` mirror, warning text from wireframe when < 4.5), typeface radio from approved set showing "नमस्ते" sample, powered-by toggle (disabled unless plan allows), live preview card, Save. |
| `/console/ops/tenants` | `OperatorTenantsScreen` (W09) | Plan cards, tenant table (name, type, plan, status chips), "+ Provision tenant" BottomSheet form (legal name, entity type, plan, slug, registration, admin) → POST; suspend/resume actions. |
| `/signup` | `SoloSignupScreen` (M15) | 3 steps (Stepper): phone + licence + consent (ConsentCheckbox notice v1.0) → OTP entry → success card with "Import my book" (link `/m/book/import`) and "Skip to Today" (`/m/today`). Errors: `otp_invalid` with attempts message, `otp_locked`, `otp_expired`. |
| `/m/me/plan` | `SoloPlanScreen` (M19) | Plan name, usage meters (customers, AI credits, messages) with warning at the plan alert threshold ("You've used 76% of this month's AI actions…"), Pro trial CTA → POST `/tenant/trials`, trial-active state. |

All screens: loading skeleton, error with trace reference, permission denied (403), Hindi strings for the mobile screens (M15, M19).

## 10. Acceptance criteria

Domain & application
- **AC-M01-01** `Tenant.create` validates slug, enforces plan ↔ kind, derives `crmMode` (SOLO → `solo_lite`, ORGANISATION → `twenty`) and `deploymentMode`; status transitions follow the table and illegal ones raise `illegal_tenant_transition`.
- **AC-M01-02** `DistributorEntity` enforces SOLO ⇔ INDIVIDUAL_AGENT, requires a Principal Officer for IMF/BROKER, reports registration `valid/expiring/expired` (60-day window) and comparison scope (BROKER market-wide, others tied).
- **AC-M01-03** Tie-up limits come from data: an IMF can hold 6 active insurers per line and the 7th is rejected with `tie_up_limit_exceeded`; an individual agent is limited to 1 per line; a broker is unlimited; limits are evaluated per date so a replaced (ended) tie-up does not count; overlapping periods for the same insurer and invalid date ranges are rejected.
- **AC-M01-04** Feature flags: referral rewards cannot be enabled (`feature_legally_locked`); online purchase cannot be enabled until a compliance review reference is recorded; every change is audited and security-logged.
- **AC-M01-05** Brand kit rejects primary colours below 4.5:1 contrast against white, unapproved typefaces and hiding "powered by" on plans that do not allow it; `contrastRatio` matches WCAG reference values (#FFFFFF/#000000 = 21, #1F5FBF/#FFFFFF ≈ 6.0).
- **AC-M01-06** Usage metering allows consumption within limits, denies beyond the limit with 429 `usage_limit_exceeded` without changing the counter, treats null limits as unlimited and emits `tenant.usage.threshold_crossed` exactly once per metric per period at the plan's alert threshold.
- **AC-M01-07** Provisioning creates tenant, entity, platform host, default flags and brand kit, runs saga steps in order, activates the tenant and emits `tenant.tenant.provisioned`; duplicate slug → 409 `slug_taken`.
- **AC-M01-08** A failing saga step leaves the tenant in `provisioning` with `failedStep`; resumption skips completed steps and completes provisioning.
- **AC-M01-09** `DirectoryTenantResolver` resolves verified hosts only; the caching decorator serves repeat lookups from cache within TTL and is invalidated on suspend/resume so a suspended tenant is rejected by the AuthGuard immediately.
- **AC-M01-10** Solo signup: OTP stored only as a hash and never logged; wrong OTP increments attempts; 5 failures lock; expiry after 10 minutes; success provisions an active SOLO tenant with `crmMode` `solo_lite` and plan SOLO; more than 3 starts per phone per hour → 429.
- **AC-M01-11** Starting a Pro trial is allowed only for SOLO tenants on SOLO and sets `trialEndsAt` 14 days ahead.

API
- **AC-M01-12** Operator endpoints require the operator role (customer-realm tokens → 403); list/paginate tenants; status transitions and plan change (with `If-Match`, stale → 412) work and are audited.
- **AC-M01-13** Tenant endpoints use the host-resolved tenant only: tenant A's admin cannot read or change tenant B's tie-ups, flags or brand kit (isolation test), and permission checks apply (`tenant.tie_up.write` etc.).
- **AC-M01-14** `GET /public/tenant-config` returns brand and languages for a known host, 404 for an unknown host, and requires no token.
- **AC-M01-15** Postgres: migration applies; RLS isolates tenant-scoped tables; `iap_app` cannot insert into `tenant` directly. *(integration)*

Frontend
- **AC-M01-16** Tenant setup screen shows entity, registration status chip, comparison scope, tie-ups per line with used/max; saving an over-limit line shows the server error inline; referral rewards switch is disabled with the legal explanation; online purchase requires a recorded review before enabling.
- **AC-M01-17** Brand kit screen warns live when contrast < 4.5:1, disables Save in that state, shows the typeface sample and disables the powered-by toggle when the plan forbids it.
- **AC-M01-18** Operator screen lists tenants with status chips and provisions a tenant via the sheet form (POST with Idempotency-Key), showing `failedStep` when provisioning is incomplete.
- **AC-M01-19** Solo signup screen walks phone/licence/consent → OTP → success, blocks continue without consent, and shows `otp_invalid`, `otp_locked` and `otp_expired` messages; Hindi strings render when the language is हि.
- **AC-M01-20** Solo plan screen renders usage meters, shows the warning at the alert threshold and starts a Pro trial.
