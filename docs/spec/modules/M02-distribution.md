# M02 · Distribution Network — low-level design

Status: Ready for build · Depends on: M00, M01 · Requirements: Rev 3.0 §1 (memberships), §3 (roles), F02, F32/F92 (onboarding & activation), F33/F91 (hierarchy & supervision), F86 (licence & training), F97 (exit) · HLD §7 (Distribution Network), §11 (authorisation), §17B K7 (leavers) · Screens: W02 `OnboardingHierarchy`, W10 `UsersRoles`

## 1. Responsibilities

Owns the organisation tree, tenant memberships (members), roles and their permissions per tenant (versioned), record scope, salesperson type and onboarding evidence, licences, insurer codes, leave and capacity, and member exit with ownership transfer. Publishes three read ports used by other modules: `SellerDirectory` (routing eligibility for M04), `RecordScopeResolver` (query scoping for M03/M04/…), and a data-driven `PermissionPolicy` that replaces the kernel's static matrix.

Identity itself (credentials, OTP, MFA, SSO) stays in Keycloak behind `IdentityAdmin`; a member links to an identity by `userRef`.

## 2. Module layout

```
apps/core/src/modules/distribution/
  domain/
    org-unit.ts           OrgUnit + OrgTree (Composite)
    member.ts             Member aggregate, MemberStatus state machine (State), SalespersonType
    onboarding.ts         OnboardingChecklist, ChecklistItem, ChecklistTemplate (Strategy per salesperson type)
    licence.ts            Licence, LicenceExpiry thresholds
    roles.ts              RoleCatalogue, RoleDefinition (versioned), LOCKED_PERMISSIONS, PRIVILEGED_ROLES, RecordScopeKind
    selling-scope.ts      SellingScope (what an active seller may sell)
    events.ts
  application/
    ports.ts
    org-unit.service.ts
    member.service.ts            invite, update, status transitions, exit
    onboarding.service.ts        evidence, insurer codes, activation
    licence.service.ts           record, expiring list, LicenceExpiryScanner (daily job)
    role.service.ts              role editor (versions), DataDrivenPermissionPolicy
    record-scope.resolver.ts     RecordScopeResolver
    seller-directory.ts          SellerDirectory implementation
  infrastructure/  in-memory + pg repositories, StubIdentityAdmin
  api/             schemas.ts, org-units.controller.ts, members.controller.ts, roles.controller.ts, licences.controller.ts
  distribution.module.ts
apps/core/migrations/020_distribution.sql
apps/web/src/features/distribution/
```

## 3. Domain model

### 3.1 Organisation tree (Composite)
```ts
export type OrgUnitKind = 'HEAD_OFFICE' | 'REGION' | 'BRANCH' | 'TEAM';
export interface OrgUnit { id: string; parentId?: string; kind: OrgUnitKind; name: string; territoryCodes: string[] }
export class OrgTree {
  constructor(units: OrgUnit[])            // exactly one HEAD_OFFICE root else ValidationError('org_tree_root_invalid')
  add(unit: OrgUnit): OrgTree              // returns new tree; parent must exist; allowed parent kinds: REGION→HEAD_OFFICE; BRANCH→HEAD_OFFICE|REGION; TEAM→BRANCH; violation → BusinessRuleError('org_unit_parent_invalid')
  move(unitId: string, newParentId: string): OrgTree   // same parent-kind rule; moving under own descendant → BusinessRuleError('org_unit_cycle')
  subtreeIds(unitId: string): string[]     // includes unitId, depth-first
  ancestors(unitId: string): OrgUnit[]     // nearest first
  get(unitId: string): OrgUnit             // NotFoundError('org_unit')
  toNested(): OrgUnitNode[]                // { ...unit, children: OrgUnitNode[] } for the hierarchy view
}
```
Every tenant gets a HEAD_OFFICE root at provisioning (subscribe to `tenant.tenant.provisioned`; idempotent). Solo tenants have only the root.

### 3.2 Member aggregate (State pattern)
```ts
export type SalespersonType = 'EMPLOYEE' | 'ISP' | 'POSP' | 'SOLO';
export type MemberStatus = 'invited' | 'onboarding' | 'active' | 'suspended' | 'exited';
export interface MemberProps {
  id: string; userRef?: string; displayName: string; phoneMasked?: string; emailMasked?: string;
  contactHash: string;                       // sha256 of normalised phone/email for duplicate-invite detection
  roles: string[]; salespersonType?: SalespersonType; orgUnitId: string; status: MemberStatus;
  capacityPerDay: number;                    // default 25, 0..500
  skills: string[]; languages: string[];     // e.g. ['LIFE','HEALTH'], ['en','hi']
  invitedAt: string; activatedAt?: string; exitedAt?: string; inviteExpiresAt: string; version: number;
}
export class Member {
  static invite(input: { id: string; displayName: string; phone?: PhoneNumber; email?: EmailAddress; roles: string[]; salespersonType?: SalespersonType; orgUnitId: string; now: Date }): Member
  // at least one of phone/email (ValidationError('contact_required')); roles non-empty and from RoleCatalogue (ValidationError('unknown_role'))
  // SALESPERSON role ⇔ salespersonType present (BusinessRuleError('salesperson_type_mismatch')); SOLO type only with SOLO_OWNER role
  // inviteExpiresAt = now + 7 days; status 'invited'
  static restore(p: MemberProps): Member
  acceptInvite(userRef: string, now: Date): void     // invited → onboarding (sellers) or active (non-sellers); expired invite → BusinessRuleError('invite_expired')
  activate(now: Date, checklist: OnboardingChecklist): void   // onboarding|suspended → active; sellers require checklist.isComplete() else BusinessRuleError('onboarding_incomplete', …, { missing })
  suspend(now: Date): void                           // active → suspended (deactivate in W10)
  exit(now: Date): void                              // active|suspended|onboarding|invited → exited
  changeRoles(roles: string[]): void                 // same validation as invite; not when exited
  moveTo(orgUnitId: string): void
  setCapacity(capacityPerDay: number): void
  isSeller(): boolean                                // salespersonType defined
  readonly props: Readonly<MemberProps>
}
```
Transitions: `invited→onboarding|active|exited`, `onboarding→active|exited`, `active→suspended|exited`, `suspended→active|exited`. Illegal → `BusinessRuleError('illegal_member_transition', …, { from, to })`.

### 3.3 Onboarding checklist (Strategy per salesperson type — F92)
```ts
export type ChecklistItemKey = 'IDENTITY_PAN' | 'TRAINING' | 'EXAM' | 'CERTIFICATE' | 'INSURER_CODE';
export interface ChecklistItem { key: ChecklistItemKey; done: boolean; evidenceRef?: string; note?: string; hoursLogged?: number; hoursRequired?: number; completedAt?: string }
export interface ChecklistTemplate { readonly salespersonType: SalespersonType; items(): ChecklistItem[] }
export const POSP_TEMPLATE: ChecklistTemplate   // all 5 items; TRAINING hoursRequired 15
export const ISP_TEMPLATE: ChecklistTemplate    // all 5 items; TRAINING hoursRequired 25
export const EMPLOYEE_TEMPLATE: ChecklistTemplate // IDENTITY_PAN, INSURER_CODE
export const SOLO_TEMPLATE: ChecklistTemplate   // empty (licence captured at signup, verified externally)
export function templateFor(type: SalespersonType): ChecklistTemplate
export class OnboardingChecklist {
  static for(type: SalespersonType): OnboardingChecklist
  static restore(items: ChecklistItem[]): OnboardingChecklist
  recordEvidence(key: ChecklistItemKey, input: { evidenceRef: string; note?: string }, now: Date): void   // TRAINING cannot be completed this way (use logTraining); unknown key for template → ValidationError('checklist_item_not_applicable')
  logTraining(hours: number, evidenceRef: string, now: Date): void   // hours 0.5..40; done when hoursLogged >= hoursRequired
  markInsurerCodeMapped(now: Date): void
  isComplete(): boolean
  missing(): ChecklistItemKey[]
  items(): readonly ChecklistItem[]
}
```
Evidence references point to external provider records or M13 documents (checksum stored there). PAN numbers are **never** stored here — only the KYC provider's reference.

### 3.4 Licences (F86)
```ts
export type LicenceKind = 'POSP_LIFE' | 'POSP_GENERAL' | 'ISP' | 'INDIVIDUAL_AGENT' | 'OTHER';
export interface Licence { id: string; memberId: string; kind: LicenceKind; number: string; validFrom: string; validTo: string; verifiedAt?: string }
export const EXPIRY_THRESHOLDS_DAYS = [60, 30, 7] as const;
export function daysUntil(dateIso: string, today: Date): number
export function dueThreshold(licence: Licence, today: Date, alreadyAlerted: number[]): 60 | 30 | 7 | undefined
// returns the smallest threshold t such that daysUntil <= t and t not in alreadyAlerted; expired licences return undefined (handled as 'expired')
```

### 3.5 Roles, permissions, record scope
```ts
export type RecordScopeKind = 'OWN' | 'UNIT_SUBTREE' | 'TENANT';
export interface RoleDefinition { role: string; version: number; permissions: string[]; recordScope: RecordScopeKind; privileged: boolean; editable: boolean }
export const LOCKED_PERMISSIONS: readonly string[] = ['party.medical.read', 'audit.delete', 'ops.*'];  // cannot be granted/removed by tenant role edits
export class RoleCatalogue {
  static defaults(): RoleCatalogue      // table below
  get(role: string): RoleDefinition     // NotFoundError('role')
  list(): RoleDefinition[]
  withPermissions(role: string, permissions: string[]): RoleCatalogue
  // non-editable role → BusinessRuleError('role_not_editable'); adding or removing a LOCKED permission → BusinessRuleError('permission_locked', …, { permission }); unknown permission (not in PERMISSION_REGISTRY) → ValidationError('unknown_permission'); version + 1
}
export const PERMISSION_REGISTRY: ReadonlySet<string>   // union of all permissions modules register (M00 me.read, telemetry.write; M01 tenant.*; M02 distribution.*; later modules add theirs)
```
Default role catalogue (Rev 3.0 §3, W10 copy):

| Role | Record scope | Privileged (MFA) | Editable | Default permissions (M02 part; other modules append theirs) |
|---|---|---|---|---|
| `TENANT_ADMIN` | TENANT | yes | no | `distribution.*`, `tenant.*` |
| `PRINCIPAL_OFFICER` | TENANT | yes | no | `distribution.member.read`, `distribution.member.write`, `distribution.onboarding.approve`, `distribution.role.read` |
| `BRANCH_MANAGER` | UNIT_SUBTREE | yes | yes | `distribution.member.read`, `distribution.onboarding.write`, `distribution.onboarding.approve`, `distribution.transfer.write` |
| `SALES_MANAGER` | UNIT_SUBTREE | yes | yes | `distribution.member.read`, `distribution.onboarding.write` |
| `SALESPERSON` | OWN | no | yes | `distribution.self.read` |
| `SOLO_OWNER` | TENANT | no | no | `distribution.self.read`, `distribution.licence.write` |
| `OPS` | TENANT | yes | yes | `distribution.member.read`, `distribution.onboarding.write`, `distribution.licence.write` |
| `FINANCE` | TENANT | yes | yes | `distribution.member.read` |
| `COMPLIANCE` | TENANT | yes | yes | `distribution.member.read`, `distribution.licence.read` |
| `CMS_AUTHOR` | OWN | no | yes | — |
| `CMS_PUBLISHER` | TENANT | yes | yes | — |

`distribution.licence.read` is implied by `distribution.member.read`.

```ts
export interface RecordScope { kind: RecordScopeKind; memberId?: string; orgUnitIds?: string[] }
export class RecordScopeResolver {
  constructor(roles: RoleRepository, orgUnits: OrgUnitRepository)
  resolve(tx: Transaction, principal: Principal): Promise<RecordScope>
  // widest scope across the principal's roles wins (TENANT > UNIT_SUBTREE > OWN); UNIT_SUBTREE → subtreeIds(principal.orgUnitId); OWN → memberId (missing memberId → ForbiddenError('member_required'))
}
export function inScope(scope: RecordScope, record: { ownerMemberId?: string; orgUnitId?: string }): boolean
export class DataDrivenPermissionPolicy implements PermissionPolicy   // kernel port; reads the tenant's role catalogue (cached per tenant 60 s, invalidated on role edit); platform.operator → ops.*
export interface MfaPolicy { requiresMfa(roles: readonly string[]): boolean }      // any privileged role
```
**Kernel extension (part of this module's delivery):** `Principal` gains `amr?: string[]` (from the JWT `amr` claim) and the AuthGuard, after tenant checks, calls an optional `MFA_POLICY` provider: privileged roles without `'mfa'` in `amr` → `ForbiddenError('mfa_required')` + `security.mfa_required` log. Non-privileged sellers sign in with OTP (`amr: ['otp']`).

### 3.6 Selling scope (consumed by M05 comparison scope)
```ts
export interface SellingScope { memberId: string; salespersonType: SalespersonType; posEligibleOnly: boolean; lines: Array<'LIFE' | 'HEALTH' | 'GENERAL'>; insurerCodes: Record<string, string> }
// posEligibleOnly = salespersonType === 'POSP'; lines = lines with a valid licence or (EMPLOYEE/ISP) all lines; only for active members
```

## 4. Ports (application/ports.ts)
```ts
export interface OrgUnitRepository { tree(tx: Transaction): Promise<OrgTree>; save(tx: Transaction, unit: OrgUnit): Promise<void> }
export interface MemberRepository {
  get(tx: Transaction, id: string): Promise<Member | undefined>
  findByContactHash(tx: Transaction, hash: string): Promise<Member | undefined>   // non-exited only
  findByUserRef(tx: Transaction, userRef: string): Promise<Member | undefined>
  list(tx: Transaction, filter: { status?: MemberStatus; role?: string; orgUnitIds?: string[]; salespersonType?: SalespersonType; q?: string; cursor?: string; limit: number }): Promise<{ items: Member[]; nextCursor?: string }>
  countSeats(tx: Transaction): Promise<number>                                    // invited + onboarding + active + suspended
  save(tx: Transaction, m: Member): Promise<void>                                 // optimistic version
}
export interface ChecklistRepository { get(tx: Transaction, memberId: string): Promise<OnboardingChecklist | undefined>; save(tx: Transaction, memberId: string, c: OnboardingChecklist): Promise<void> }
export interface LicenceRepository {
  listForMember(tx: Transaction, memberId: string): Promise<Licence[]>
  save(tx: Transaction, l: Licence): Promise<void>
  expiringWithin(tx: Transaction, days: number, today: Date): Promise<Licence[]>
  alertedThresholds(tx: Transaction, licenceId: string): Promise<number[]>
  recordAlert(tx: Transaction, licenceId: string, threshold: number): Promise<void>
}
export interface InsurerCodeRepository { list(tx: Transaction, memberId: string): Promise<Array<{ insurerId: string; code: string }>>; put(tx: Transaction, memberId: string, insurerId: string, code: string): Promise<void> }  // duplicate code for the same insurer in tenant → ConflictError('insurer_code_taken')
export interface LeaveRepository { isOnLeave(tx: Transaction, memberId: string, at: Date): Promise<boolean>; add(tx: Transaction, memberId: string, from: string, to: string): Promise<void> }
export interface RoleRepository { catalogue(tx: Transaction): Promise<RoleCatalogue>; save(tx: Transaction, def: RoleDefinition): Promise<void> }  // stores tenant overrides; defaults otherwise
export interface IdentityAdmin {                    // Keycloak admin (HLD K7); StubIdentityAdmin in memory
  invite(tenantId: string, member: { memberId: string; contact: { phone?: string; email?: string }; roles: string[] }): Promise<void>
  updateRoles(tenantId: string, userRef: string, roles: string[]): Promise<void>
  revokeSessions(tenantId: string, userRef: string): Promise<void>
  disable(tenantId: string, userRef: string): Promise<void>
}
export interface SellerDirectory {                  // published for M04 routing
  eligibleSellers(tx: Transaction, criteria: { orgUnitIds?: string[]; line?: 'LIFE' | 'HEALTH' | 'GENERAL'; posEligibleProduct?: boolean; language?: string; at: Date }): Promise<EligibleSeller[]>
  sellingScope(tx: Transaction, memberId: string, at: Date): Promise<SellingScope | undefined>
}
export interface EligibleSeller { memberId: string; displayName: string; orgUnitId: string; salespersonType: SalespersonType; capacityPerDay: number; skills: string[]; languages: string[] }
// eligibility: status active; not on leave at `at`; seller; POSP only when posEligibleProduct !== false; licence for the line valid at `at` when the type requires one (POSP, INDIVIDUAL_AGENT); within orgUnitIds when given; language match when given
```

## 5. Application services

| Service | Method | Behaviour |
|---|---|---|
| `OrgUnitService` | `tree()`, `create({ parentId, kind, name, territoryCodes })`, `move(id, parentId)` | audit; event `distribution.org_unit.changed` |
| `MemberService` | `invite(input)` | contact normalised and hashed; existing non-exited member with same contact → `ConflictError('member_exists')`; seats: `countSeats + 1 > entitlements.limitFor('seats')` → `BusinessRuleError('seat_limit_reached')`; creates checklist when seller; `IdentityAdmin.invite`; event `distribution.member.invited` (no contact data in payload); audit |
| | `acceptInvite(memberId, userRef)` | called by identity webhook/first login; transitions per §3.2 |
| | `update(id, { roles?, orgUnitId?, capacityPerDay?, skills?, languages? }, version)` | role change → `IdentityAdmin.updateRoles` + `revokeSessions`; security log `security.member.roles_changed` |
| | `transition(id, { to: 'active' \| 'suspended', reason })` | suspend → `revokeSessions` + `disable` immediately (K7), security log; reactivation re-runs activation rule |
| | `exit(id, { transferToMemberId?, reason })` | sellers with owned records require `transferToMemberId` that is an eligible active seller in the same tenant (else `BusinessRuleError('transfer_target_invalid')`); emits `distribution.member.exited` `{ memberId, transferToMemberId }` (M04 reassigns leads, tasks and customers via its subscriber); `revokeSessions` + `disable`; data stays with the tenant — no customer export for ISPs (F97) |
| `OnboardingService` | `get(memberId)`, `recordEvidence(memberId, key, { evidenceRef, note })`, `logTraining(memberId, { hours, evidenceRef })`, `mapInsurerCode(memberId, { insurerId, code })`, `activate(memberId)` | activation needs `distribution.onboarding.approve`; checklist complete; event `distribution.member.activated` `{ memberId, salespersonType, sellingScope }`; audit |
| `LicenceService` | `record(memberId, licence)`, `expiring(withinDays)` | validTo > validFrom; event `distribution.licence.recorded` |
| `LicenceExpiryScanner` | `run(tenantId, today)` | for each licence with `dueThreshold` → `recordAlert` + event `distribution.licence.expiring` `{ memberId, licenceId, kind, daysLeft, threshold }` exactly once per threshold; also creates no tasks itself (M04 subscribes) |
| `RoleService` | `list()`, `get(role)`, `updatePermissions(role, permissions, version)`, `preview(role)` → `{ role, sees: string[] }` (human-readable list from permission descriptions) | invalidates `DataDrivenPermissionPolicy` cache; security log `security.role.permissions_changed`; audit |

All writes run in `uow.run(tenantId, …)` with outbox + audit in the same transaction.

## 6. API (`/api/v1`; ✱ = `@Idempotent()`)

| Method | Path | Permission | Request → Response |
|---|---|---|---|
| GET | `/org-units` | `distribution.member.read` | `{ root: OrgUnitNode }` with `memberCount` per node |
| POST ✱ | `/org-units` | `distribution.org.write` (TENANT_ADMIN) | `{ parentId, kind, name, territoryCodes? }` → 201 `OrgUnit` |
| POST ✱ | `/org-units/{id}/moves` | `distribution.org.write` | `{ parentId }` → `OrgUnit` |
| GET | `/members?status=&role=&orgUnitId=&salespersonType=&q=&limit=&cursor=` | `distribution.member.read` (scoped by record scope: managers see their subtree) | `{ items: MemberView[], nextCursor? }` |
| POST ✱ | `/members` | `distribution.member.write` | `{ displayName, phone?, email?, roles, salespersonType?, orgUnitId }` → 201 `MemberView` |
| GET | `/members/{id}` | read in scope, or self | `MemberView & { checklist?: ChecklistItem[]; licences: Licence[]; insurerCodes: [] }` |
| PATCH | `/members/{id}` (`If-Match`) | `distribution.member.write` | partial `{ roles?, orgUnitId?, capacityPerDay?, skills?, languages? }` → `MemberView` |
| POST ✱ | `/members/{id}/status-transitions` | `distribution.member.write` | `{ to: 'active' \| 'suspended', reason }` → `MemberView` |
| POST ✱ | `/members/{id}/exit` | `distribution.member.write` | `{ transferToMemberId?, reason }` → `MemberView` |
| POST ✱ | `/members/{id}/onboarding/evidence` | `distribution.onboarding.write` | `{ key, evidenceRef, note? }` → checklist |
| POST ✱ | `/members/{id}/onboarding/training` | `distribution.onboarding.write` | `{ hours, evidenceRef }` → checklist |
| PUT | `/members/{id}/insurer-codes/{insurerId}` | `distribution.onboarding.write` | `{ code }` → `{ insurerId, code }` |
| POST ✱ | `/members/{id}/activation` | `distribution.onboarding.approve` | — → `MemberView` (422 `onboarding_incomplete` with `missing`) |
| POST ✱ | `/members/{id}/licences` | `distribution.licence.write` | `Licence` minus ids → 201 `Licence` |
| GET | `/licences/expiring?withinDays=60` | `distribution.licence.read` | `{ items: Array<Licence & { memberName, daysLeft }> }` |
| POST ✱ | `/members/{id}/leave` | `distribution.member.write` or self | `{ from, to }` → 204 |
| GET | `/roles` | `distribution.role.read` | `{ items: RoleDefinition[] }` |
| PUT | `/roles/{role}/permissions` (`If-Match: "v<version>"`) | `distribution.role.write` (TENANT_ADMIN) | `{ permissions: string[] }` → `RoleDefinition` |
| GET | `/roles/{role}/preview` | `distribution.role.read` | `{ role, sees: string[] }` |
| GET | `/me/selling-scope` | authenticated seller | `SellingScope` |

`MemberView = { id, displayName, phoneMasked?, emailMasked?, roles, salespersonType?, orgUnitId, orgUnitName, status, capacityPerDay, skills, languages, invitedAt, activatedAt?, mfaRequired: boolean, version }` — raw phone/e-mail are never returned.

## 7. DDL — `apps/core/migrations/020_distribution.sql`
```sql
create table if not exists org_unit (
  id text primary key, tenant_id text not null references tenant(id), parent_id text references org_unit(id),
  kind text not null check (kind in ('HEAD_OFFICE','REGION','BRANCH','TEAM')), name text not null,
  territory_codes text[] not null default '{}', created_at timestamptz not null default now()
);
create unique index if not exists org_unit_one_root on org_unit (tenant_id) where parent_id is null;
create table if not exists member (
  id text primary key, tenant_id text not null references tenant(id), user_ref text, display_name text not null,
  phone_masked text, email_masked text, contact_hash text not null,
  roles text[] not null, salesperson_type text check (salesperson_type in ('EMPLOYEE','ISP','POSP','SOLO')),
  org_unit_id text not null references org_unit(id),
  status text not null check (status in ('invited','onboarding','active','suspended','exited')),
  capacity_per_day int not null default 25, skills text[] not null default '{}', languages text[] not null default '{en}',
  invited_at timestamptz not null, invite_expires_at timestamptz not null, activated_at timestamptz, exited_at timestamptz,
  version int not null default 1
);
comment on column member.display_name is 'P2';
create unique index if not exists member_contact_active on member (tenant_id, contact_hash) where status <> 'exited';
create unique index if not exists member_user_ref on member (tenant_id, user_ref) where user_ref is not null;
create table if not exists onboarding_checklist (tenant_id text not null references tenant(id), member_id text primary key references member(id), items jsonb not null, updated_at timestamptz not null default now());
create table if not exists licence (
  id text primary key, tenant_id text not null references tenant(id), member_id text not null references member(id),
  kind text not null, number text not null, valid_from date not null, valid_to date not null, verified_at timestamptz
);
create table if not exists licence_alert (tenant_id text not null, licence_id text not null references licence(id), threshold int not null, alerted_at timestamptz not null default now(), primary key (licence_id, threshold));
create table if not exists insurer_code (tenant_id text not null references tenant(id), member_id text not null references member(id), insurer_id text not null, code text not null, primary key (member_id, insurer_id), unique (tenant_id, insurer_id, code));
create table if not exists member_leave (tenant_id text not null, member_id text not null references member(id), from_date date not null, to_date date not null, primary key (member_id, from_date));
create table if not exists tenant_role (tenant_id text not null references tenant(id), role text not null, version int not null, permissions text[] not null, updated_at timestamptz not null default now(), primary key (tenant_id, role));
-- RLS tenant_isolation on all tables above; grants to iap_app
```

## 8. Observability

| Event / metric | Level |
|---|---|
| `distribution.member.invited/activated/suspended/exited`, `distribution.licence.expiring`, `distribution.org_unit.changed` | domain events + info |
| `security.member.roles_changed`, `security.member.suspended`, `security.role.permissions_changed`, `security.mfa_required` | security |
| `distribution_activation_days` histogram (invite → activation) | metric |
| `distribution_licences_expiring` gauge `{threshold}` after each scan | metric |

## 9. Frontend (apps/web/src/features/distribution)

| Route | Screen (wireframe) | Behaviour |
|---|---|---|
| `/console/onboarding` | `OnboardingHierarchyScreen` (W02) | KPI tiles (in onboarding, licences expiring in 60 days); hierarchy tree with counts and filter by unit; onboarding pipeline columns by checklist stage (Invite accepted → Identity → Training & exam → Certificate → Insurer codes); selecting a candidate shows the evidence checklist with notes, insurer code input, "Activate" enabled only when complete (else "Activate · checklist incomplete"); exit panel: choose transfer target, confirm, F97 note "customers stay with the tenant; the ISP receives no customer export". "+ Invite salesperson" sheet. |
| `/console/users` | `UsersRolesScreen` (W10) | KPI tiles (active users, privileged with MFA, invites pending, deactivated); role filter chips; user DataGrid (name, masked contact, role, record scope, sign-in method OTP/MFA, status, action Deactivate/Reactivate); role permission editor with locked permissions shown disabled with "Locked", Save creates a new version (If-Match); "What a <role> sees" preview; sign-in policy and medical-documents note copy from the wireframe. |

## 10. Acceptance criteria

- **AC-M02-01** `OrgTree` enforces a single HEAD_OFFICE root, valid parent kinds and no cycles; `subtreeIds` and `ancestors` are correct.
- **AC-M02-02** `Member.invite` validates contact, roles and salesperson-type consistency and sets a 7-day invite expiry; member transitions follow the table; illegal ones raise `illegal_member_transition`; expired invites cannot be accepted.
- **AC-M02-03** Checklist templates differ by salesperson type (POSP 15 h, ISP 25 h training, employee identity + insurer code, solo none); training completes only when logged hours reach the requirement; `missing()` lists open items.
- **AC-M02-04** Activation of a seller is refused with `onboarding_incomplete` and the missing items until the checklist is complete, requires `distribution.onboarding.approve`, and emits `distribution.member.activated` with the selling scope (POSP → POS-eligible only).
- **AC-M02-05** Inviting beyond the plan's seat limit is refused with `seat_limit_reached`; a second active membership with the same contact in the same tenant is refused, while the same person may hold a membership in another tenant (no cross-tenant lookup).
- **AC-M02-06** Suspending a member revokes sessions and disables the identity immediately and is security-logged; role changes revoke sessions.
- **AC-M02-07** Exit of a seller requires an eligible transfer target in the same tenant and emits `distribution.member.exited` with the target; no export is produced.
- **AC-M02-08** Licence expiry scanner alerts once per threshold (60/30/7 days) per licence and never twice for the same threshold.
- **AC-M02-09** `SellerDirectory.eligibleSellers` returns only active, non-leave sellers within the unit subtree, excludes POSPs for non-POS products, excludes sellers whose required licence is expired, and filters by language.
- **AC-M02-10** `RecordScopeResolver` gives OWN for salespeople, UNIT_SUBTREE for branch/sales managers and TENANT for admin/ops/compliance roles (widest wins); member list is scoped accordingly (a branch manager does not see another branch's members).
- **AC-M02-11** Role editor: locked permissions cannot be added or removed, non-editable roles are rejected, unknown permissions rejected, each save increments the version (stale `If-Match` → 412), the permission policy reflects the change immediately, and the change is security-logged.
- **AC-M02-12** MFA: a privileged role whose token lacks `amr: ['mfa']` gets 403 `mfa_required`; an OTP-signed salesperson is allowed.
- **AC-M02-13** API responses never contain raw phone or e-mail; tenant isolation holds for every endpoint (tenant B cannot read tenant A's members, licences or roles).
- **AC-M02-14** Postgres: migration applies; RLS isolates all distribution tables; unique active contact per tenant is enforced by the index. *(integration)*
- **AC-M02-15** Onboarding screen: tree filter, pipeline columns, checklist with evidence notes, Activate disabled until complete, insurer code entry, exit with transfer target and the F97 note.
- **AC-M02-16** Users & roles screen: filters, deactivate/reactivate with confirmation, locked permissions disabled, save role creates a new version, "what this role sees" preview, MFA column.
