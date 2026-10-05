# M03 · Party & Consent — low-level design

M07 integration amendment (ADR-M07-cross-module-contracts, approved 2026-10-03): `PartyProps.birthday?: string` stores the derived DOB month/day (`MM-DD`) internally. Capturing DOB derives it without additional decryption. `PartySummary` adds optional `dobYear` and `birthday`; HTTP views and Twenty projections do not expose birthday. Merge copies the projection with the selected DOB; erasure clears both. Existing rows without a projection skip alerts. `PartyFacade.rolesForSubject(tx, subjectType: 'HELD_POLICY' | 'PROPOSAL', subjectId): Promise<PartyRoleLink[]>` exposes role links for lifecycle alert subjects; the repository gains the same query.

`PartyFacade.searchByName(tx, name): Promise<PartySummary[]>` publishes tenant-scoped candidates for M07 referrer review. M07 filters to exact normalized name and its resolved record scope; the importer must explicitly confirm the link.

Status: Ready for build · Depends on: M00, M01, M02 · Requirements: Rev 3.0 F07, F08, F09 (party side), F37, F38, F40; §6 data model (party, contact point, relationship); §18 (DPDP, messaging) · HLD §7 (Party & Consent), §8 (P3 stays in Core, projection to Twenty), §11 (classification, field encryption, consent ledger) · Screens: CRM04 `CRMCustomers`, CRM09 `CRMCustomerRecord` (profile, household, consent), CRM08 `CRMImportDedup` (duplicate queue)

## 1. Responsibilities

System of record for people and organisations a tenant deals with: identity, contact points, household links, role links to policies/proposals, the append-only consent ledger, suppression, contactability decisions, duplicate detection and reviewed merges. P3 fields (date of birth, PAN) are field-level encrypted and reachable only through a protected accessor. No cross-tenant matching, ever (F40).

## 2. Module layout
```
apps/core/src/modules/party/
  domain/
    party.ts                 Party aggregate, PartyStatus
    contact-point.ts         ContactPoint (masked, hashed, encrypted value)
    household.ts             Household, HouseholdMember, Relation
    party-role.ts            PartyRoleLink (PROPOSER/INSURED/PAYER/NOMINEE on a subject)
    consent.ts               ConsentRecord, ConsentLedger (state = latest per purpose+channel)
    suppression.ts           Suppression
    contactability.ts        ContactabilityPolicy + rules (Chain of Responsibility)
    name-matching.ts         normaliseName(), jaroWinkler()
    dedup-rules.ts           DuplicateRule implementations + DuplicateMatcher (Chain of Responsibility)
    merge.ts                 MergePlan, SurvivorChoice, MergeRecord
    events.ts
  application/
    ports.ts                 repositories, FieldCipher, PolicyNumberLookup, PartyFacade (published)
    party.service.ts         create, update, search, get (masked view)
    sensitive-party.accessor.ts   ProtectedPartyAccessor (Proxy) for P3 reads
    consent.service.ts       record, ledger, contactability
    duplicate.service.ts     queue, compare, merge, dismiss, reverse
    household.service.ts
    party.facade.ts          PartyFacade implementation for other modules
  infrastructure/
    aes-gcm-field-cipher.ts  FieldCipher (AES-256-GCM, per-tenant key via HKDF from master key)
    in-memory-party.repositories.ts, pg-party.repositories.ts
  api/  schemas.ts, parties.controller.ts, consents.controller.ts, duplicates.controller.ts, households.controller.ts
  party.module.ts
apps/core/migrations/030_party.sql
apps/web/src/features/party/
```

## 3. Domain model

### 3.1 Party
```ts
export type PartyKind = 'PERSON' | 'ORGANISATION';
export type PartyStatus = 'ACTIVE' | 'MERGED' | 'ERASED';
export type Language = 'en' | 'hi' | string;          // BCP-47 short code
export type Channel = 'MOBILE' | 'EMAIL';
export type PreferredChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL';
export interface PartyProps {
  id: string; kind: PartyKind; displayName: string;        // P2
  dateOfBirthEnc?: string;                                  // P3 ciphertext (base64)
  dobYear?: number;                                         // P2, for age bands and matching without decrypt
  gender?: 'F' | 'M' | 'X';
  panEnc?: string; panHash?: string; panLast4?: string;     // P3 (+ lookup hash)
  preferredLanguage: Language; preferredChannel?: PreferredChannel;
  ownerMemberId?: string; orgUnitId?: string;               // record scope (M02)
  tags: string[];
  source: { kind: 'LEAD' | 'IMPORT' | 'MANUAL' | 'SIGNUP' | 'BOOK'; ref?: string };
  status: PartyStatus; mergedIntoId?: string;
  contactPoints: ContactPoint[];
  createdAt: string; updatedAt: string; version: number;
}
export class Party {
  static create(input: { id: string; kind: PartyKind; displayName: string; contactPoints: ContactPoint[]; preferredLanguage?: Language; preferredChannel?: PreferredChannel; ownerMemberId?: string; orgUnitId?: string; source: PartyProps['source']; tags?: string[]; now: Date }): Party
  // displayName trimmed 2..120 (ValidationError('invalid_name')); ≤ 5 contact points; at most one primary per channel (first of a channel becomes primary)
  static restore(p: PartyProps): Party
  rename(displayName: string, now: Date): void
  addContactPoint(cp: ContactPoint): void         // duplicate hash on same party → ConflictError('contact_point_exists')
  removeContactPoint(hash: string): void          // cannot remove the last contact point (BusinessRuleError('last_contact_point'))
  setSensitive(input: { dateOfBirthEnc?: string; dobYear?: number; panEnc?: string; panHash?: string; panLast4?: string }): void
  assignOwner(memberId: string, orgUnitId: string): void
  markMerged(intoId: string, now: Date): void     // ACTIVE → MERGED; otherwise BusinessRuleError('party_not_active')
  restoreFromMerge(now: Date): void               // MERGED → ACTIVE (merge reversal)
  erase(now: Date): void                          // DSR erasure (M11): clears P2/P3 fields, displayName '[erased]', contact points removed, status ERASED
  primary(channel: Channel): ContactPoint | undefined
  readonly props: Readonly<PartyProps>
}
```

### 3.2 ContactPoint
```ts
export interface ContactPoint { channel: Channel; valueEnc: string; valueHash: string; masked: string; isPrimary: boolean; verifiedAt?: string }
export class ContactPointFactory {
  constructor(cipher: FieldCipher)
  create(tenantId: string, input: { channel: Channel; value: string; isPrimary?: boolean }): Promise<ContactPoint>
  // MOBILE → PhoneNumber.parse (e164 encrypted, hash of e164, masked); EMAIL → EmailAddress.parse
  hashFor(tenantId: string, channel: Channel, value: string): string   // normalise then cipher.hash — used by search and dedup
}
```
Shared numbers are allowed: two parties may hold the same `valueHash` (family phone). It is a dedup **signal**, never an identity.

### 3.3 Household and role links
```ts
export type Relation = 'SELF' | 'SPOUSE' | 'CHILD' | 'PARENT' | 'SIBLING' | 'OTHER';
export interface HouseholdMember { partyId: string; relation: Relation }
export class Household {
  static create(input: { id: string; name: string; head: string /* partyId */ }): Household   // head gets SELF
  add(partyId: string, relation: Relation): void       // already member → ConflictError('already_in_household'); second SELF → BusinessRuleError('household_single_self')
  remove(partyId: string): void                        // head cannot be removed while others remain
  readonly id: string; readonly name: string; readonly members: readonly HouseholdMember[]
}
export type PartyRole = 'PROPOSER' | 'INSURED' | 'PAYER' | 'NOMINEE' | 'LIFE_ASSURED';
export interface PartyRoleLink { partyId: string; role: PartyRole; subjectType: 'HELD_POLICY' | 'PROPOSAL'; subjectId: string; label?: string /* e.g. 'term', 'health' */; createdAt: string }
```
A party belongs to at most one household (Rev 3.0 "optional household linking").

### 3.4 Consent ledger (F37; DPDP)
```ts
export type ConsentPurpose = 'SERVICE' | 'MARKETING' | 'AI_PROCESSING' | 'DATA_SHARING_INSURER';
export type ConsentChannel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL' | 'ANY';
export interface ConsentRecord {
  id: string; partyId: string; purpose: ConsentPurpose; channel: ConsentChannel; granted: boolean;
  noticeVersion: string; source: 'WEB_FORM' | 'ASSISTED' | 'IMPORT' | 'CUSTOMER_LINK' | 'SIGNUP';
  evidenceRef?: string; capturedBy: string /* actor pseudonym or 'customer' */; occurredAt: string;
}
export class ConsentLedger {
  constructor(records: ConsentRecord[])                       // any order; sorted by occurredAt then id
  append(r: ConsentRecord): ConsentLedger                     // returns new ledger (append-only)
  stateFor(purpose: ConsentPurpose, channel: ConsentChannel): { granted: boolean; record?: ConsentRecord }
  // latest record for (purpose, channel); if none, latest for (purpose, 'ANY'); if none → not granted. A channel-specific withdrawal overrides an earlier ANY grant and vice-versa by time.
  summary(): Array<{ purpose: ConsentPurpose; channel: ConsentChannel; granted: boolean; occurredAt: string; noticeVersion: string }>   // latest per pair
  history(): readonly ConsentRecord[]
}
```
Records are never updated or deleted (DB grants enforce). Notice text lives with the notice version (M14); only the version is stored here.

### 3.5 Suppression
```ts
export type SuppressionReason = 'DND' | 'OPT_OUT' | 'BOUNCE' | 'DSR' | 'COMPLAINT';
export interface Suppression { id: string; contactHash: string; channel: ConsentChannel; reason: SuppressionReason; from: string; to?: string; createdBy: string }
export function isActive(s: Suppression, at: Date): boolean
```
Suppression is keyed by **contact hash**, not party, so it holds even when the same number appears on another party record or a new lead (F37 "suppression rechecked at send time").

### 3.6 Contactability (Chain of Responsibility)
```ts
export interface ContactabilityQuery { party: Party; ledger: ConsentLedger; suppressions: Suppression[]; channel: Exclude<ConsentChannel, 'ANY'>; purpose: ConsentPurpose; at: Date }
export type ContactabilityReason = 'ok' | 'party_inactive' | 'no_contact_point' | 'suppressed' | 'consent_missing' | 'consent_withdrawn';
export interface ContactabilityDecision { allowed: boolean; reason: ContactabilityReason; detail?: { suppressionReason?: SuppressionReason; consentRecordId?: string } }
export interface ContactabilityRule { readonly name: string; evaluate(q: ContactabilityQuery): ContactabilityDecision | undefined /* undefined = pass to next */ }
export class PartyActiveRule, ContactPointRule, SuppressionRule, ConsentRule implements ContactabilityRule
export class ContactabilityPolicy {
  constructor(rules?: ContactabilityRule[])   // default order: PartyActive → ContactPoint → Suppression → Consent
  decide(q: ContactabilityQuery): ContactabilityDecision   // first non-undefined decision wins; all pass → { allowed: true, reason: 'ok' }
}
```
Rules:
- `ContactPointRule`: WHATSAPP/SMS/CALL need a MOBILE contact point; EMAIL needs EMAIL.
- `SuppressionRule`: any active suppression on the primary contact hash for that channel or `ANY`.
- `ConsentRule`: `MARKETING`, `AI_PROCESSING`, `DATA_SHARING_INSURER` need an explicit current grant (`consent_missing` when never recorded, `consent_withdrawn` when latest is a withdrawal). `SERVICE` is allowed unless the latest SERVICE record for the channel is a withdrawal (design baseline — Compliance to confirm, Rev 3.0 §18).

### 3.7 Duplicate detection (Chain of Responsibility, tenant-scoped)
```ts
export function normaliseName(name: string): string     // lowercase, strip honorifics (mr, mrs, ms, dr, shri, smt, kumari, sri), remove punctuation, collapse spaces, NFKD + strip diacritics
export function jaroWinkler(a: string, b: string): number // standard JW, prefix scale 0.1, max prefix 4; returns 0..1
export interface MatchCandidateInput { partyId?: string; displayName: string; contactHashes: string[]; panHash?: string; dobYear?: number; dobHash?: string }
export interface DuplicateSignal { rule: string; score: number; autoMergeAllowed: false; explanation: string }
export interface DuplicateRule { readonly name: string; match(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined }
export class SamePanRule          // pan hashes equal → 100, 'Same PAN'
export class SameEmailAndNameRule // shared email hash and name JW ≥ 0.85 → 90
export class SameMobileAndNameRule// shared mobile hash and name JW ≥ 0.85 → 90
export class NameAndDobRule       // name JW ≥ 0.92 and dobHash equal → 80
export class SharedContactOnlyRule// shared contact hash but name JW < 0.85 → 40, explanation 'Shared mobile — likely family member; never auto-merged'
export class DuplicateMatcher {
  constructor(rules?: DuplicateRule[])   // default order above
  compare(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined   // first matching rule wins (rules ordered by strength)
  isCandidate(signal: DuplicateSignal | undefined, threshold = 60): boolean
}
```
`autoMergeAllowed` is always `false`: every merge is a human decision (wireframe: "A shared mobile alone never auto-merges people").

### 3.8 Merge (reviewed, reversible for 30 days)
```ts
export type MergeField = 'displayName' | 'dateOfBirth' | 'pan' | 'preferredLanguage' | 'preferredChannel' | 'ownerMemberId';
export interface SurvivorChoice { field: MergeField; from: 'A' | 'B' }
export interface MergeRecord { id: string; survivorId: string; mergedId: string; choices: SurvivorChoice[]; movedLinks: { roleLinks: number; consents: number; household?: string }; mergedAt: string; mergedBy: string; reversibleUntil: string; reversedAt?: string }
export class MergePlan {
  static build(a: Party, b: Party, choices: SurvivorChoice[], survivor: 'A' | 'B'): MergePlan
  // both ACTIVE (BusinessRuleError('party_not_active')); a.id !== b.id; every MergeField resolved (missing → default to survivor)
  apply(now: Date): { survivor: Party; merged: Party }
  // survivor takes chosen field values; contact points = union by hash (survivor primaries win); tags union; merged.markMerged(survivor.id)
}
```
Consents, role links and household membership of the merged party are **re-pointed** to the survivor (history kept: consent records are copied with `evidenceRef: 'merge:<mergeId>'`, never rewritten). Reversal within 30 days restores the merged party to ACTIVE and moves the re-pointed links back using the record; after 30 days → `BusinessRuleError('merge_not_reversible')`.

## 4. Ports (application/ports.ts)
```ts
export interface FieldCipher {
  encrypt(tenantId: string, plaintext: string): Promise<string>   // base64(iv|ciphertext|tag)
  decrypt(tenantId: string, ciphertext: string): Promise<string>
  hash(tenantId: string, value: string): string                   // HMAC-SHA256(tenant lookup key, value) hex — equal inputs → equal hashes within a tenant, different across tenants
}
export interface PartyRepository {
  get(tx: Transaction, id: string): Promise<Party | undefined>
  save(tx: Transaction, p: Party): Promise<void>                                // optimistic version
  findByContactHash(tx: Transaction, hash: string): Promise<Party[]>             // ACTIVE only
  findByPanHash(tx: Transaction, hash: string): Promise<Party[]>
  searchByName(tx: Transaction, prefix: string, limit: number): Promise<Party[]>  // normalised prefix / trigram in pg
  list(tx: Transaction, filter: { scope: RecordScope; tag?: string; householdId?: string; cursor?: string; limit: number }): Promise<{ items: Party[]; nextCursor?: string }>
}
export interface ConsentRepository { ledger(tx: Transaction, partyId: string): Promise<ConsentLedger>; append(tx: Transaction, r: ConsentRecord): Promise<void> }
export interface SuppressionRepository { activeFor(tx: Transaction, contactHash: string, at: Date): Promise<Suppression[]>; add(tx: Transaction, s: Suppression): Promise<void> }
export interface HouseholdRepository { forParty(tx: Transaction, partyId: string): Promise<Household | undefined>; get(tx: Transaction, id: string): Promise<Household | undefined>; save(tx: Transaction, h: Household): Promise<void> }
export interface RoleLinkRepository { forParty(tx: Transaction, partyId: string): Promise<PartyRoleLink[]>; add(tx: Transaction, l: PartyRoleLink): Promise<void>; repoint(tx: Transaction, fromPartyId: string, toPartyId: string): Promise<number> }
export interface DuplicateRepository {
  upsertCandidate(tx: Transaction, c: DuplicateCandidate): Promise<void>        // unique on ordered pair
  list(tx: Transaction, filter: { status: 'open'; cursor?: string; limit: number }): Promise<{ items: DuplicateCandidate[]; nextCursor?: string }>
  get(tx: Transaction, id: string): Promise<DuplicateCandidate | undefined>
  setStatus(tx: Transaction, id: string, status: 'merged' | 'dismissed'): Promise<void>
  saveMerge(tx: Transaction, m: MergeRecord): Promise<void>; getMerge(tx: Transaction, id: string): Promise<MergeRecord | undefined>
}
export interface DuplicateCandidate { id: string; partyAId: string; partyBId: string; score: number; rule: string; explanation: string; status: 'open' | 'merged' | 'dismissed'; createdAt: string }
export interface PolicyNumberLookup { partyIdsForPolicyNumber(tx: Transaction, policyNumber: string): Promise<string[]> }   // provided by M07; default returns []
export interface RecordScopeProvider { resolve(tx: Transaction, principal: Principal): Promise<RecordScope> }               // M02 RecordScopeResolver

/** Published facade for other modules (Facade pattern) — the only way M04+ touch parties. */
export interface PartyFacade {
  findOrCreate(tx: Transaction, input: CreatePartyInput & { onDuplicate: 'link' | 'create' }): Promise<{ partyId: string; created: boolean; candidates: DuplicateCandidateView[] }>
  // 'link' → when a candidate with score ≥ 90 exists, return it (created false); else create and queue candidates ≥ 60
  linkRole(tx: Transaction, link: Omit<PartyRoleLink, 'createdAt'>): Promise<void>
  contactability(tx: Transaction, partyId: string, channel: Exclude<ConsentChannel, 'ANY'>, purpose: ConsentPurpose, at: Date): Promise<ContactabilityDecision>
  recordConsent(tx: Transaction, input: Omit<ConsentRecord, 'id' | 'occurredAt'>): Promise<ConsentRecord>
  summary(tx: Transaction, partyId: string): Promise<PartySummary | undefined>        // masked, for projections and timelines
  absorb(tx: Transaction, fromPartyId: string, intoPartyId: string): Promise<{ mergeId: string }>   // merge with survivor = into, default choices (used when a lead is linked to an existing customer)
  candidatesFor(tx: Transaction, partyId: string): Promise<DuplicateCandidateView[]>  // open candidates involving the party
}
export interface PartySummary { id: string; displayName: string; primaryMobileMasked?: string; primaryEmailMasked?: string; preferredLanguage: string; preferredChannel?: PreferredChannel; status: PartyStatus; ownerMemberId?: string }
```
Token names: `PARTY_REPOSITORY, CONSENT_REPOSITORY, SUPPRESSION_REPOSITORY, HOUSEHOLD_REPOSITORY, ROLE_LINK_REPOSITORY, DUPLICATE_REPOSITORY, FIELD_CIPHER, POLICY_NUMBER_LOOKUP, RECORD_SCOPE_PROVIDER, PARTY_FACADE`.

`AesGcmFieldCipher(masterKey: Buffer)`: per-tenant data key = HKDF-SHA256(masterKey, salt `tenantId`, info `'iap-data-key'`), lookup key = HKDF(…, info `'iap-lookup-key'`); AES-256-GCM, random 12-byte IV. (Production replaces the master key with KMS envelope keys; the port does not change.)

## 5. Application services

| Service | Method | Behaviour |
|---|---|---|
| `PartyService` | `create(input, { onDuplicate })` | builds contact points via factory; encrypts DOB/PAN when given (`dobYear` kept); runs `DuplicateMatcher` against parties sharing any contact hash or PAN hash **in the same tenant**, plus name-prefix matches with same `dobYear`; candidates ≥ 60 queued; `onDuplicate: 'reject'` with any candidate ≥ 90 → `ConflictError('possible_duplicate', …, { candidates })`; owner defaults to the creating member (record scope); event `party.party.created` (payload: id, kind, source — no names/contacts); audit |
| | `get(id, principal)` | record-scope check (`inScope`) else `NotFoundError('party')` (do not reveal existence); returns `PartyView` (masked) |
| | `search(q, principal)` | classify `q`: 10-digit/+91 → mobile hash; contains `@` → email hash; matches PAN pattern → pan hash; `/^[A-Z0-9/-]{6,30}$/` with digits → `PolicyNumberLookup`; else name prefix (min 2 chars); results filtered by record scope; max 25 |
| | `update(id, patch, version)` | `displayName`, `preferredLanguage`, `preferredChannel`, `tags`, add/remove contact point; contact change re-runs dedup; event `party.party.updated` (field names only) |
| | `list(filter, principal)` | scoped list for CRM04 with household name, roles summary, tags |
| `ProtectedPartyAccessor` | `sensitive(id, principal, purpose: 'PROPOSAL' \| 'SERVICING' \| 'DSR')` | Proxy: requires permission `party.sensitive.read`; decrypts DOB and PAN; writes audit `party.sensitive.read` with purpose; never cached; returns `{ dateOfBirth?, pan? }` |
| `ConsentService` | `record(partyId, input)` | appends; withdrawal of `MARKETING` on a channel also adds `OPT_OUT` suppression for that channel's contact hash; event `party.consent.recorded` `{ partyId, purpose, channel, granted, noticeVersion }`; audit |
| | `ledger(partyId)`, `contactability(partyId, channel, purpose)` | decision via `ContactabilityPolicy`; `party_contactability_decisions_total{purpose,channel,allowed}` |
| | `suppress({ contact: { channel, value } \| { contactHash }, reason, to? })` | operator/compliance; event `party.suppression.added` |
| `DuplicateService` | `queue()`, `compare(candidateId)`, `merge(candidateId, { survivor, choices })`, `dismiss(candidateId)`, `reverse(mergeId)` | compare returns field-by-field values (masked for contacts, DOB as year only); merge applies `MergePlan`, re-points consents/roles/household, saves `MergeRecord` (reversibleUntil = now + 30 d), events `party.party.merged` `{ survivorId, mergedId, mergeId }` (M04 relinks leads/opportunities); audit; requires `party.merge` |
| `HouseholdService` | `create`, `addMember`, `removeMember`, `forParty` | events `party.household.changed` |

## 6. API (`/api/v1`; ✱ = `@Idempotent()`)

| Method | Path | Permission | Request → Response |
|---|---|---|---|
| POST ✱ | `/parties` | `party.write` | `{ kind, displayName, contacts: [{ channel, value, isPrimary? }], dateOfBirth?: 'YYYY-MM-DD', pan?: string, preferredLanguage?, preferredChannel?, tags?, consent?: { purpose, channel, granted, noticeVersion, source, evidenceRef? }[], onDuplicate?: 'create' \| 'reject' }` → 201 `{ party: PartyView, duplicateCandidates: DuplicateCandidateView[] }` / 409 `possible_duplicate` |
| GET | `/parties?q=&tag=&householdId=&segment=&limit=&cursor=` | `party.read` | `{ items: PartyListItem[], nextCursor? }`; `segment` = `with_dues` \| `no_policy` (ADR-M03-customer-segments; ids from M07 `PartyBookSegmentReader`, AND with the other filters and record scope; other values → 400 `validation_failed`) |
| GET | `/parties/{id}` | `party.read` | `PartyView & { household?: HouseholdView; roles: PartyRoleLink[]; consentSummary: ConsentSummaryItem[] }` |
| PATCH | `/parties/{id}` (`If-Match`) | `party.write` | patch → `PartyView` |
| GET | `/parties/{id}/sensitive?purpose=` | `party.sensitive.read` | `{ dateOfBirth?, pan? }` (audited; `Cache-Control: no-store`) |
| GET | `/parties/{id}/consents` | `party.read` | `{ summary: ConsentSummaryItem[], history: ConsentRecordView[] }` |
| POST ✱ | `/parties/{id}/consents` | `party.consent.write` | `{ purpose, channel, granted, noticeVersion, source, evidenceRef? }` → 201 `ConsentRecordView` |
| GET | `/parties/{id}/contactability?channel=&purpose=` | `party.read` | `ContactabilityDecision` |
| POST ✱ | `/suppressions` | `party.suppression.write` | `{ channel, value? , contactHash?, reason, to? }` → 201 |
| GET | `/duplicates?limit=&cursor=` | `party.merge` | `{ items: DuplicateCandidateView[] }` (`{ id, a: PartyListItem, b: PartyListItem, score, rule, explanation }`) |
| GET | `/duplicates/{id}/comparison` | `party.merge` | `{ fields: [{ field, a, b }], sourceA, sourceB }` |
| POST ✱ | `/duplicates/{id}/merge` | `party.merge` | `{ survivor: 'A' \| 'B', choices: SurvivorChoice[] }` → `{ mergeId, survivorId, reversibleUntil }` |
| POST ✱ | `/duplicates/{id}/dismissal` | `party.merge` | — → 204 |
| POST ✱ | `/merges/{id}/reversal` | `party.merge` | — → `{ restoredPartyId }` |
| POST ✱ | `/households` | `party.write` | `{ name, headPartyId }` → 201 `HouseholdView` |
| POST ✱ | `/households/{id}/members` | `party.write` | `{ partyId, relation }` → `HouseholdView` |
| DELETE | `/households/{id}/members/{partyId}` | `party.write` | 204 |

Views: `PartyView = { id, kind, displayName, contacts: [{ channel, masked, isPrimary, verified }], dobYear?, panLast4?, preferredLanguage, preferredChannel?, ownerMemberId?, tags, source, status, createdAt, version }` — never raw contacts, DOB or PAN. `PartyListItem = { id, displayName, primaryMobileMasked?, householdName?, rolesSummary: string[], tags, ownerMemberId? }`.

Permissions registered: `SALESPERSON, SOLO_OWNER → party.read, party.write, party.consent.write` · `BRANCH_MANAGER, SALES_MANAGER → + party.merge` · `OPS → party.*` except `party.sensitive.read` is granted only with purpose on proposals (M09) — at launch OPS has `party.sensitive.read` · `COMPLIANCE → party.read, party.consent.write, party.suppression.write` · `TENANT_ADMIN → party.*`.

## 7. DDL — `apps/core/migrations/030_party.sql`
```sql
create table if not exists party (
  id text primary key, tenant_id text not null references tenant(id),
  kind text not null check (kind in ('PERSON','ORGANISATION')), display_name text not null, display_name_norm text not null,
  dob_enc text, dob_year int, gender text, pan_enc text, pan_hash text, pan_last4 text,
  preferred_language text not null default 'en', preferred_channel text,
  owner_member_id text, org_unit_id text, tags text[] not null default '{}',
  source_kind text not null, source_ref text, status text not null check (status in ('ACTIVE','MERGED','ERASED')),
  merged_into_id text references party(id), created_at timestamptz not null, updated_at timestamptz not null, version int not null default 1
);
comment on column party.display_name is 'P2'; comment on column party.dob_enc is 'P3'; comment on column party.pan_enc is 'P3';
create index if not exists party_name_norm_idx on party (tenant_id, display_name_norm text_pattern_ops);
create index if not exists party_pan_hash_idx on party (tenant_id, pan_hash) where pan_hash is not null;
create table if not exists contact_point (
  tenant_id text not null, party_id text not null references party(id) on delete cascade,
  channel text not null check (channel in ('MOBILE','EMAIL')), value_enc text not null, value_hash text not null,
  masked text not null, is_primary boolean not null, verified_at timestamptz, primary key (party_id, value_hash)
);
comment on column contact_point.value_enc is 'P2';
create index if not exists contact_point_hash_idx on contact_point (tenant_id, value_hash);
create table if not exists household (id text primary key, tenant_id text not null, name text not null, head_party_id text not null references party(id));
create table if not exists household_member (tenant_id text not null, household_id text not null references household(id), party_id text not null references party(id), relation text not null, primary key (party_id));
create table if not exists party_role_link (tenant_id text not null, party_id text not null references party(id), role text not null, subject_type text not null, subject_id text not null, label text, created_at timestamptz not null default now(), primary key (party_id, role, subject_type, subject_id));
create table if not exists consent_record (
  id text primary key, tenant_id text not null, party_id text not null references party(id), purpose text not null, channel text not null,
  granted boolean not null, notice_version text not null, source text not null, evidence_ref text, captured_by text not null, occurred_at timestamptz not null
);
create table if not exists suppression (id text primary key, tenant_id text not null, contact_hash text not null, channel text not null, reason text not null, from_at timestamptz not null, to_at timestamptz, created_by text not null);
create index if not exists suppression_hash_idx on suppression (tenant_id, contact_hash);
create table if not exists duplicate_candidate (
  id text primary key, tenant_id text not null, party_a_id text not null references party(id), party_b_id text not null references party(id),
  score int not null, rule text not null, explanation text not null, status text not null check (status in ('open','merged','dismissed')),
  created_at timestamptz not null, unique (tenant_id, party_a_id, party_b_id)
);
create table if not exists party_merge (id text primary key, tenant_id text not null, survivor_id text not null, merged_id text not null, choices jsonb not null, moved_links jsonb not null, merged_at timestamptz not null, merged_by text not null, reversible_until timestamptz not null, reversed_at timestamptz);
-- RLS tenant_isolation on all; consent_record: grant select, insert only (append-only ledger)
```
Ordered pair rule: `party_a_id < party_b_id` lexicographically before upsert.

## 8. Observability

| Event / metric | Level |
|---|---|
| `party.party.created/updated/merged`, `party.consent.recorded`, `party.suppression.added`, `party.household.changed` | domain events; payloads carry ids, enums and versions only — no names, contacts, DOB or PAN (asserted in tests) |
| audit `party.sensitive.read` with purpose | audit |
| `party_duplicates_detected_total{rule}` | counter |
| `party_contactability_decisions_total{purpose,channel,allowed}` | counter |
| `party.merge.reversed` | info |

Logs never contain raw contact values: the kernel redactor masks them, and services pass only ids and hashes (test asserts no `+91` digits beyond masks in `MemoryLogSink` after a create).

## 9. Frontend (apps/web/src/features/party)

| Route | Screen (wireframe) | Behaviour |
|---|---|---|
| `/crm/customers` | `CustomersScreen` (CRM04) | Segment chips (All, With dues → `segment=with_dues`, No policy → `segment=no_policy`, Tags; no counts on any chip), search box (name / mobile / email / policy no.), DataGrid (customer, masked mobile, household, roles, owner, tags); row select opens household side panel (members with relation and roles) with "Open full record" and "Create opportunity" (navigates to `/crm/pipeline/new?partyId=` — M04); copy "Shared numbers never merge people automatically". |
| `/crm/customers/:id` | `CustomerRecordScreen` (CRM09) | Breadcrumb; header (initials, name, household, owner, language & channel preference, consent notice version); action buttons (Call/WhatsApp disabled with reason when contactability denies); tabs: Overview (household and roles), Consent (summary per purpose/channel with Granted/Withdrawn chips and dates, "Record consent" sheet with ConsentCheckbox, withdrawal), Policies/Activity/Documents tabs show "Coming in a later module" until M04/M07/M13. |
| `/crm/import/duplicates` | `DuplicateQueueScreen` (CRM08 queue part) | Merge sends `survivor: 'A'`; the per-field choices decide every value (user decision 2026-10-05); Queue list with score, rule explanation; compare table field-by-field with A/B radio per field; "Merge records" (confirm sheet stating merges are reversible for 30 days) and "Not a duplicate"; empty state "Queue is clear." |

## 10. Acceptance criteria

- **AC-M03-01** `Party.create` validates name and contact points, sets one primary per channel and keeps contact values only encrypted + hashed + masked; removing the last contact point is refused.
- **AC-M03-02** `FieldCipher` round-trips plaintext, produces different ciphertexts for the same input (random IV), produces equal hashes for equal inputs within a tenant and different hashes across tenants, and fails to decrypt with another tenant's key.
- **AC-M03-03** Consent ledger is append-only and `stateFor` returns the latest record per purpose+channel with `ANY` fallback and correct override by time; summary lists the latest per pair.
- **AC-M03-04** Contactability: inactive party, missing contact point, active suppression on the contact hash, missing or withdrawn consent each deny with their reason (in that precedence); SERVICE is allowed without explicit grant unless withdrawn; marketing requires a grant.
- **AC-M03-05** Withdrawing MARKETING consent on a channel adds an OPT_OUT suppression for that contact, and the suppression also blocks a different party record sharing the same number.
- **AC-M03-06** `normaliseName` strips honorifics/punctuation/diacritics; `jaroWinkler` matches reference values (`MARTHA`/`MARHTA` ≈ 0.961, `DIXON`/`DICKSONX` ≈ 0.813); identical strings = 1.
- **AC-M03-07** Duplicate rules: same PAN → 100; same mobile + similar name → 90; same email + similar name → 90; similar name + same DOB → 80; shared mobile with different name → 40 with the family explanation and never a merge candidate above threshold; `autoMergeAllowed` is always false.
- **AC-M03-08** Creating a party queues candidates ≥ 60 within the tenant only — an identical person in another tenant is never matched (F40); `onDuplicate: 'reject'` returns 409 `possible_duplicate` with candidates ≥ 90; `PartyFacade.findOrCreate('link')` returns the existing party.
- **AC-M03-09** Merge applies survivor choices, unions contact points and tags, re-points consents (history preserved with merge evidence), role links and household, marks the other party MERGED, emits `party.party.merged` and audits; reversal within 30 days restores both; after 30 days it is refused.
- **AC-M03-10** Search classifies mobile, email, PAN, policy number and name queries and applies record scope (a salesperson finds only their own customers; a manager their subtree).
- **AC-M03-11** Party views and list items never expose raw mobile, e-mail, DOB or PAN; the sensitive endpoint requires `party.sensitive.read`, returns `no-store`, and writes an audit record with the purpose; domain events and logs contain no personal values.
- **AC-M03-12** Household: one SELF, a party in at most one household, head removal rule.
- **AC-M03-13** Tenant isolation for every endpoint; record-scope `get` returns 404 for out-of-scope parties.
- **AC-M03-14** Postgres: migration applies; RLS isolation; `consent_record` rejects UPDATE/DELETE for `iap_app`; contact hash lookups use the index. *(integration)*
- **AC-M03-15** Customers screen: search, segment chips, grid with masked mobiles, household panel with roles, and the shared-number note.
- **AC-M03-16** Customer record screen: header with preferences and consent notice version, consent tab with granted/withdrawn chips, record-consent sheet (notice version shown), WhatsApp/Call disabled with the contactability reason when denied.
- **AC-M03-17** Duplicate queue: compare with per-field survivor choice, merge confirmation mentioning 30-day reversibility, "Not a duplicate", and the empty state.
- **AC-M03-18** `GET /parties?segment=with_dues` returns only policyholders of a non-terminal policy with an installment `DUE_TODAY`, `IN_GRACE`, `RENEWAL_DUE` or `UPCOMING` within 7 days (IST); a party whose only such policy is terminal is excluded.
- **AC-M03-19** `GET /parties?segment=no_policy` returns only parties with no held policy as policyholder or insured; an insured-only party is excluded; an unknown `segment` → 400 `validation_failed`.

## 11. CR-001 additions — custom fields on parties

Kernel contract: M00 §16.5; definitions from M01 (`CUSTOM_FIELD_DEFINITIONS`, entity `party`).

- Domain: `PartyProps.customFields: CustomFieldValues` (default `{}`); `Party.replaceCustomFields(values: CustomFieldValues, now: Date): void` (values already validated; keys of definitions that are not active are preserved from the current set; bumps `updatedAt`). `Party.create` takes optional `customFields` (validated by the service).
- `PartyService.create`: when `customFields` is present, validate with `CustomFieldValidator.validate(await defs.activeFor(tx, 'party'), input.customFields)`; absent → `{}` (also for `PartyFacade.findOrCreate` from leads/imports).
- `PartyService.replaceCustomFields(principal, id, values, expectedVersion)`: scope check as `get` (out of scope → 404); version check (412); validate; save; audit `party.custom_fields.replaced` with keys only (never values); no domain event.
- Views: `PartyView.customFields` = `CustomFieldValidator.visible(...)` (unmasked, active definitions only); `PartyListItem.customFields` = `CustomFieldValidator.mask(...)` (P2 → `'****'`).
- Merge: the survivor keeps its values; keys it lacks are copied from the merged party; reversal restores both sets.
- Never projected to Twenty, never logged.

| Method | Path | Permission | Request / Response |
|---|---|---|---|
| POST ✱ | `/parties` | `party.write` | body gains `customFields?: Record<string, string \| number \| boolean \| null>`; 400 `invalid_custom_fields` with `errors[{ path: 'customFields.<key>', code }]` |
| PUT | `/parties/{id}/custom-fields` (`If-Match`) | `party.write` | `{ customFields: Record<string, string \| number \| boolean \| null> }` → `PartyView` + `ETag`; 400 `invalid_custom_fields`; 404; 412 |

DDL — `apps/core/migrations/032_party_custom_fields.sql`:
```sql
alter table party add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table party add column if not exists custom_schema_version int not null default 1;   -- envelope version of custom_fields (CR-001 §3.3)
```

- **AC-CR001-08** (M03) A party created with `customFields` stores validated values; `PUT /parties/{id}/custom-fields` replaces them (stale `If-Match` → 412, unknown key / wrong type / required missing / PAN in text → 400 `invalid_custom_fields` naming the field); the detail view shows values, the list masks P2 values; values are tenant-isolated and persisted on Postgres *(integration)*.
