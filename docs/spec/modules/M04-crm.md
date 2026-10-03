# M04 · CRM Engagement — low-level design

Status: Ready for build · Depends on: M00–M03 · Requirements: Rev 3.0 F03, F05, F06, F08 (lead import), F09 (activity side), F10 (communication log), F79 (daily plan), F84 (offline queue, CRM side); Rev 2.0 funnel; launch acceptance LA-2 · HLD D1, D5 (CRM Port), §6 (Twenty boundaries), §8 (field ownership), §10 (Solo-CRM-lite), §12 (Twenty down → degraded mode), §17B G6 (workspace key + webhook checks) · Screens: CRM01 `CRMLeads`, CRM02 `CRMLeadDetail`, CRM03 `CRMPipeline`, CRM05 `CRMTasks`, CRM07 `CRMAssignment`, CRM08 `CRMImportDedup` (lead import part), M02 `LeadsPipeline`, M16 `LeadDetail`, M17 `MyTasks`, M01 `Main` (Today, CRM part)

Delivered in two build passes: **M04a** (§3–§6 leads, routing, activities, tasks, opportunities, my-work, import) and **M04b** (§7 Twenty sync).

## 1. Responsibilities and the CRM Port

Engagement data — leads, opportunities, tasks, activities, routing — is reached by the BFF **only through the CRM Port** (HLD D5). Core keeps these records in its own tables for every tenant:

- **Solo tenants** (`crmMode = solo_lite`): Core tables are the system of record (HLD §10 Solo-CRM-lite).
- **Organisation tenants** (`crmMode = twenty`): Core tables are the write-ahead store and the PWA read cache; every change is projected to the tenant's Twenty workspace through the outbox and the CRM sync worker, and Twenty webhooks come back through the inbox. Selling continues when Twenty is down (records show `syncState: pending`).

So the application layer depends on one `CrmPort`; the adapters differ only in whether a projection is scheduled. Insurance facts (party identity, consent, policies) stay in M03/M07 — leads reference `partyId`.

```ts
export interface CrmPort {                                        // HLD D5 operations
  upsertPerson(tx: Transaction, party: PartySummary): Promise<void>
  createLead(tx: Transaction, lead: Lead): Promise<void>
  saveLead(tx: Transaction, lead: Lead): Promise<void>
  moveStage(tx: Transaction, subject: { kind: 'LEAD' | 'OPPORTUNITY'; id: string }, stage: string): Promise<void>
  createTask(tx: Transaction, task: Task): Promise<void>
  listMyWork(tx: Transaction, memberId: string, at: Date): Promise<MyWorkItem[]>
}
export class SoloCrmLiteAdapter implements CrmPort      // writes Core tables only
export class TwentyProjectingCrmAdapter implements CrmPort  // Decorator over SoloCrmLiteAdapter: same writes + outbox 'crm.sync.requested' per change (M04b)
export class CrmPortFactory { forMode(mode: CrmMode): CrmPort }   // Factory: tenant crmMode from M01
```

## 2. Module layout
```
apps/core/src/modules/crm/
  domain/
    lead.ts                Lead aggregate, LeadStage (State), Qualification, Attribution, SLA
    stage-rules.ts         StageEntryRule specifications, StageRuleSet (configurable per tenant)
    activity.ts            Activity, CallOutcome, SensitiveContentGuard
    task.ts                Task aggregate, TaskBucket grouping
    opportunity.ts         Opportunity aggregate, OpportunityStage (State), LostReason
    routing/
      routing-rule.ts      RoutingRule, RuleCondition (Specification over LeadRoutingFacts)
      strategies.ts        RoutingStrategy: RoundRobin, LeastLoaded, Territory, Skill, DirectOwner (Strategy)
      routing-engine.ts    RoutingEngine (first matching rule wins; eligibility always applied)
    cadence.ts             CadencePolicy (task auto-creation rules)
    my-work.ts             MyWorkItem, MyWorkContributor (Composite of contributors)
    events.ts
  application/
    ports.ts
    lead-capture.service.ts      staff + public capture, lead dedup, consent, routing, first task
    lead.service.ts              get, list, stats, stage transitions, qualification, assignment, link-to-customer
    activity.service.ts
    conversion.service.ts        lead → party + opportunity with attribution
    opportunity.service.ts       board, moves, lost, issued (event-driven only)
    task.service.ts
    routing.service.ts           rules CRUD, simulation, capacity
    my-work.service.ts
    lead-import.service.ts
    subscribers.ts               member exited, party merged, policy issued, SLA sweep job
  infrastructure/
    in-memory-crm.repositories.ts, pg-crm.repositories.ts
    solo-crm-lite.adapter.ts, twenty-projecting.adapter.ts
    twenty/ twenty-client.ts (port) http-twenty-client.ts fake-twenty-client.ts crm-sync.worker.ts twenty-webhook.controller.ts   (M04b)
  api/  schemas.ts, leads.controller.ts, public-leads.controller.ts, opportunities.controller.ts, tasks.controller.ts, routing.controller.ts, my-work.controller.ts, lead-imports.controller.ts
  crm.module.ts
apps/core/migrations/040_crm.sql
apps/web/src/features/crm/
```

## 3. Domain model

### 3.1 Lead aggregate (State pattern)
```ts
export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';
export type LeadSource = 'WEB_FORM' | 'MICROSITE' | 'REFERRAL' | 'WALK_IN' | 'PHONE' | 'EVENT' | 'CAMPAIGN' | 'IMPORT' | 'API';
export type ProductLine = 'TERM_LIFE' | 'SAVINGS_LIFE' | 'HEALTH' | 'HEALTH_FLOATER' | 'CHILD' | 'RETIREMENT' | 'MOTOR' | 'OTHER';
export function lineOfBusiness(p: ProductLine): 'LIFE' | 'HEALTH' | 'GENERAL'   // TERM/SAVINGS/CHILD/RETIREMENT → LIFE; HEALTH* → HEALTH; MOTOR/OTHER → GENERAL
export type Temperature = 'HOT' | 'WARM' | 'COLD';
export interface Qualification { need?: 'PROTECTION' | 'TAX_SAVING' | 'CHILD_EDUCATION' | 'RETIREMENT' | 'HEALTH_COVER' | 'VEHICLE'; budgetBand?: 'LT_15K' | '15K_30K' | 'GT_30K'; timeline?: 'THIS_MONTH' | '1_3_MONTHS' | 'EXPLORING'; existingCover?: string /* ≤ 200, no P3 */ }
export interface Touch { channel: string; ref?: string; at: string }
export interface Attribution { source: LeadSource; campaignId?: string; firstTouch: Touch; lastTouch: Touch; referrerPartyId?: string; micrositeMemberId?: string }
export interface LeadProps {
  id: string; partyId: string; productInterest: ProductLine; pincode?: string; language?: string;
  stage: LeadStage; temperature: Temperature; ownerMemberId?: string; orgUnitId?: string; routedByRuleId?: string;
  attribution: Attribution; qualification: Qualification; lostReason?: LostReason;
  slaDueAt?: string; firstRespondedAt?: string; stageHistory: Array<{ from?: LeadStage; to: LeadStage; at: string; by: string }>;
  convertedOpportunityId?: string; syncState: 'synced' | 'pending' | 'failed' | 'local'; externalRef?: string;
  createdAt: string; updatedAt: string; version: number;
}
export class Lead {
  static capture(input: { id: string; partyId: string; productInterest: ProductLine; attribution: Attribution; pincode?: string; language?: string; now: Date; by: string }): Lead
  // pincode /^[1-9][0-9]{5}$/ when given; stage NEW, temperature WARM, history [{ to: 'NEW' }]
  assign(memberId: string, orgUnitId: string, slaMinutes: number | undefined, now: Date, ruleId?: string): void
  // sets owner; when no response yet and slaMinutes given → slaDueAt = now + slaMinutes
  unassign(): void
  recordResponse(now: Date): void          // first outbound activity by the owner → firstRespondedAt (only once)
  slaState(now: Date): 'met' | 'breached' | 'pending' | 'none'
  // none: no slaDueAt; met: responded ≤ due; breached: responded > due or (not responded and now > due); pending otherwise
  qualify(q: Qualification): void
  moveTo(stage: Exclude<LeadStage, 'CONVERTED'>, rules: StageRuleSet, ctx: StageRuleContext, now: Date, by: string, lostReason?: LostReason): void
  // CONVERTED/LOST are terminal (BusinessRuleError('lead_closed')); moving to CONVERTED here → BusinessRuleError('use_conversion')
  // failing entry rules → BusinessRuleError('stage_rule_failed', …, { to, missing: string[] })
  // LOST requires lostReason (ValidationError('lost_reason_required'))
  markConverted(opportunityId: string, now: Date, by: string): void   // requires stage QUALIFIED (BusinessRuleError('lead_not_qualified'))
  setTemperature(t: Temperature): void
  relinkParty(partyId: string): void
  touch(t: Touch): void                    // updates attribution.lastTouch (re-enquiry)
  readonly props: Readonly<LeadProps>
}
```
Allowed stage moves: `NEW→CONTACTED|LOST`, `CONTACTED→QUALIFIED|LOST|NEW`, `QUALIFIED→CONTACTED|LOST`; conversion `QUALIFIED→CONVERTED`. Others → `BusinessRuleError('illegal_lead_transition')`.

### 3.2 Stage entry rules (Specification; F06 "stage bar with entry rules")
```ts
export interface StageRuleContext { activities: Activity[]; lead: LeadProps; consentRecorded: boolean }
export interface StageEntryRule { readonly id: string; readonly label: string; isSatisfiedBy(ctx: StageRuleContext): boolean }
export const HasConnectedContact: StageEntryRule   // an activity CALL with outcome CONNECTED, or MEETING, or WHATSAPP/EMAIL by owner — label 'Log a connected call, meeting or message'
export const HasQualification: StageEntryRule      // need, budgetBand and timeline set — label 'Complete qualification (need, budget, timeline)'
export const HasConsent: StageEntryRule            // consentRecorded — label 'Record consent to contact'
export class StageRuleSet {
  constructor(rules: Partial<Record<LeadStage, StageEntryRule[]>>)
  static defaults(): StageRuleSet                  // CONTACTED: [HasConnectedContact]; QUALIFIED: [HasConnectedContact, HasQualification, HasConsent]
  missingFor(stage: LeadStage, ctx: StageRuleContext): string[]   // labels of unmet rules
}
```
Tenant configuration of stage rules (W11) chooses from this registry; it never accepts code.

### 3.3 Activities
```ts
export type ActivityKind = 'CALL' | 'NOTE' | 'WHATSAPP' | 'SMS' | 'EMAIL' | 'MEETING' | 'STAGE_CHANGE' | 'RE_ENQUIRY' | 'ASSIGNMENT' | 'VOICE_NOTE';
export type CallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'CALL_BACK' | 'WRONG_NUMBER' | 'NOT_INTERESTED';
export interface Activity { id: string; subjectType: 'LEAD' | 'PARTY' | 'OPPORTUNITY'; subjectId: string; kind: ActivityKind; outcome?: CallOutcome; summary?: string; occurredAt: string; actorMemberId?: string; clientRef?: string /* offline idempotency */ }
export class SensitiveContentGuard {
  static check(text: string): void   // rejects PAN, 12-digit Aadhaar and card-like 16-digit numbers → BusinessRuleError('sensitive_content_not_allowed') (HLD §11: no P3 in CRM notes)
}
```
Summary ≤ 1000 chars; CALL requires outcome; `clientRef` makes offline-queued activities idempotent (unique per tenant).

### 3.4 Tasks
```ts
export type TaskKind = 'CALL' | 'WHATSAPP' | 'MEETING' | 'DOCUMENT' | 'FOLLOW_UP' | 'RENEWAL';
export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type TaskSource = 'MANUAL' | 'ROUTING' | 'CADENCE' | 'VOICE_NOTE' | 'SYSTEM';
export interface TaskProps { id: string; ownerMemberId: string; subjectType: 'LEAD' | 'PARTY' | 'OPPORTUNITY' | 'DUE' | 'PROPOSAL'; subjectId: string; kind: TaskKind; title: string; dueAt: string; status: TaskStatus; outcome?: string; source: TaskSource; escalatedAt?: string; createdAt: string; completedAt?: string; version: number }
export class Task {
  static create(input: Omit<TaskProps, 'status' | 'createdAt' | 'version' | 'completedAt' | 'escalatedAt'> & { now: Date }): Task   // title 2..140
  complete(outcome: string | undefined, now: Date): void   // OPEN → DONE
  cancel(now: Date): void                                  // OPEN → CANCELLED
  reassign(memberId: string): void                         // OPEN only
  reschedule(dueAt: Date): void
  bucket(now: Date, tz: 'Asia/Kolkata'): 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'DONE'   // TODAY = due on the same IST calendar day and not overdue
  needsEscalation(now: Date): boolean                       // OPEN, dueAt + 24 h < now, not yet escalated
  markEscalated(now: Date): void
}
```

### 3.5 Opportunity (State; Rev 2.0 funnel, Rev 3.0 "insurer confirms the sale")
```ts
export type OpportunityStage = 'DISCOVERY' | 'QUOTE_SHARED' | 'PROPOSAL_COMPLETE' | 'INSURER_PENDING' | 'ISSUED' | 'LOST';
export type LostReason = 'BOUGHT_ELSEWHERE' | 'PREMIUM_TOO_HIGH' | 'DECLINED_BY_UNDERWRITING' | 'NOT_REACHABLE' | 'POSTPONED' | 'NOT_INTERESTED' | 'OTHER';
export interface OpportunityProps { id: string; partyId: string; leadId?: string; productInterest: ProductLine; title: string; expectedPremium: { amountPaise: number; currency: 'INR' }; stage: OpportunityStage; ownerMemberId: string; orgUnitId?: string; attribution?: Attribution; insurerName?: string; lostReason?: LostReason; issuedPolicySaleId?: string; stageEnteredAt: string; createdAt: string; version: number }
export class Opportunity {
  static open(input: { id: string; partyId: string; leadId?: string; productInterest: ProductLine; title: string; expectedPremium: Money; startStage: 'DISCOVERY' | 'QUOTE_SHARED'; ownerMemberId: string; orgUnitId?: string; attribution?: Attribution; now: Date }): Opportunity
  move(to: 'DISCOVERY' | 'QUOTE_SHARED' | 'PROPOSAL_COMPLETE' | 'INSURER_PENDING', now: Date): void
  // only to an adjacent open stage (one step forward or back); from ISSUED/LOST → BusinessRuleError('opportunity_closed'); to ISSUED via move → BusinessRuleError('issued_requires_insurer_confirmation')
  markLost(reason: LostReason, now: Date): void
  markIssued(input: { policySaleId: string; confirmedBy: 'INSURER' }, now: Date): void   // only from INSURER_PENDING or PROPOSAL_COMPLETE; only via the insurer-confirmation event handler
  updateExpectedPremium(m: Money): void
  ageInStageDays(now: Date): number
}
```

### 3.6 Routing (Strategy + Specification; F05, CRM07)
```ts
export interface LeadRoutingFacts { productInterest: ProductLine; line: 'LIFE' | 'HEALTH' | 'GENERAL'; posEligibleProduct: boolean; source: LeadSource; pincode?: string; campaignId?: string; language?: string; micrositeMemberId?: string }
export type ConditionField = 'productInterest' | 'line' | 'source' | 'pincodePrefix' | 'campaignId' | 'language';
export interface RuleCondition { field: ConditionField; op: 'eq' | 'in' | 'startsWith'; value: string | string[] }
export type RoutingMethod = 'ROUND_ROBIN' | 'LEAST_LOADED' | 'TERRITORY' | 'SKILL' | 'DIRECT_OWNER';
export interface RoutingRule { id: string; priority: number; name: string; active: boolean; conditions: RuleCondition[] /* AND */; method: RoutingMethod; targetOrgUnitId?: string; slaMinutes: number /* 15..1440 */; onBreach: 'NOTIFY_MANAGER' | 'NOTIFY_THEN_REASSIGN'; reassignAfterMinutes?: number; capacityPerPerson?: number }
export function conditionSpec(conditions: RuleCondition[]): Specification<LeadRoutingFacts>
export interface RoutingCandidate extends EligibleSeller { openLeadsToday: number }   // EligibleSeller from M02
export interface RoutingStrategy { readonly method: RoutingMethod; pick(candidates: RoutingCandidate[], facts: LeadRoutingFacts, state: { lastMemberId?: string }): RoutingCandidate | undefined }
export class RoundRobinStrategy      // next candidate after lastMemberId in stable id order (wraps)
export class LeastLoadedStrategy     // lowest openLeadsToday / capacityPerDay; tie → id order
export class TerritoryStrategy       // candidates whose org unit territory matches pincode prefix are preferred (facts provide territory match via candidates' orgUnit codes — see engine), then round-robin among them
export class SkillStrategy           // candidates whose skills include the line, then least-loaded
export class DirectOwnerStrategy     // micrositeMemberId if it is among candidates
export interface RoutingDecision { memberId?: string; orgUnitId?: string; ruleId?: string; slaMinutes?: number; reason: string /* human readable, shown in "Test a lead" */; skipped: Array<{ memberId: string; reason: string }> }
export class RoutingEngine {
  constructor(strategies: RoutingStrategy[])
  route(input: { rules: RoutingRule[]; facts: LeadRoutingFacts; candidatesFor(rule: RoutingRule): Promise<RoutingCandidate[]>; cursorFor(ruleId: string): Promise<string | undefined> }): Promise<RoutingDecision>
  // rules sorted by priority asc, active only; first rule whose conditions match AND yields a pick wins
  // candidates are already eligible (M02 SellerDirectory: active, not on leave, licence for line, POSP only for POS products) and then filtered by capacity (openLeadsToday < capacityPerPerson ?? capacityPerDay)
  // no rule yields → { reason: 'No eligible salesperson — sent to the unassigned queue' }
}
```
Solo tenants bypass routing: the owner is the solo member (still recorded with reason `'Solo tenant owner'`).

### 3.7 Cadence (CRM05 cadence rules, configurable data)
```ts
export interface CadencePolicy {
  onLeadAssigned(lead: LeadProps, now: Date): TaskDraft[]                   // first call due at slaDueAt (or now + 2 h)
  onCallOutcome(lead: LeadProps, outcome: CallOutcome, now: Date, attemptsSoFar: number): TaskDraft[]
  // NO_ANSWER/CALL_BACK: attempt 1 → retry at +4 h; attempt 2 → next day 10:00 IST; ≥3 → none. CONNECTED/WRONG_NUMBER/NOT_INTERESTED → none
}
export class DefaultCadencePolicy implements CadencePolicy
export type TaskDraft = Omit<TaskProps, 'id' | 'status' | 'createdAt' | 'version' | 'completedAt' | 'escalatedAt'>
```

### 3.8 My work (F79, Composite of contributors)
```ts
export interface MyWorkItem { kind: 'TASK' | 'HOT_LEAD' | 'SLA_AT_RISK' | 'DUE' | 'PROPOSAL' | 'BIRTHDAY'; id: string; title: string; subtitle?: string; dueAt?: string; priority: number /* 0 highest */; subject: { type: string; id: string }; actions: Array<'CALL' | 'WHATSAPP' | 'LOG' | 'OPEN'> }
export interface MyWorkContributor { readonly name: string; contribute(tx: Transaction, memberId: string, at: Date): Promise<MyWorkItem[]> }
export class MyWorkComposer { constructor(contributors: MyWorkContributor[]); compose(tx, memberId, at): Promise<MyWorkItem[]> /* concatenated, sorted by priority then dueAt; a failing contributor is logged (warn 'crm.my_work.contributor_failed') and skipped — degrade, don't fail */ }
```
M04 contributors: `TaskContributor` (overdue + today, priority 0/1), `HotLeadContributor` (owner's NEW/CONTACTED leads with HOT temperature, priority 2), `SlaAtRiskContributor` (pending SLA due within 30 min, priority 0). M07 adds `DueContributor` later via the `MY_WORK_CONTRIBUTORS` multi-provider.

## 4. Ports (application/ports.ts)
```ts
export interface LeadRepository {
  get(tx: Transaction, id: string): Promise<Lead | undefined>
  save(tx: Transaction, lead: Lead): Promise<void>          // optimistic version
  findOpenByParty(tx: Transaction, partyId: string, since: Date): Promise<Lead | undefined>   // stage not CONVERTED/LOST
  list(tx: Transaction, filter: LeadFilter): Promise<{ items: Lead[]; nextCursor?: string }>
  countOpenToday(tx: Transaction, memberIds: string[], dayStart: Date): Promise<Record<string, number>>
  stats(tx: Transaction, scope: RecordScope, now: Date): Promise<LeadStats>
  reassignOwner(tx: Transaction, fromMemberId: string, toMemberId: string): Promise<number>
  relinkParty(tx: Transaction, fromPartyId: string, toPartyId: string): Promise<number>
  slaBreachCandidates(tx: Transaction, now: Date, limit: number): Promise<Lead[]>
}
export interface LeadFilter { scope: RecordScope; stage?: LeadStage[]; ownerMemberId?: string | 'unassigned'; productInterest?: ProductLine; source?: LeadSource; slaState?: 'breached' | 'pending'; q?: string; sort?: 'createdAt' | '-createdAt' | 'slaDueAt'; cursor?: string; limit: number }
export interface LeadStats { open: number; unassigned: number; slaMetPct7d: number | null; leadToIssuedPct90d: number | null }
export interface ActivityRepository { add(tx: Transaction, a: Activity): Promise<{ duplicate: boolean }> /* clientRef unique */; forSubject(tx: Transaction, type: Activity['subjectType'], id: string, limit: number): Promise<Activity[]>; countCallAttempts(tx: Transaction, leadId: string): Promise<number> }
export interface TaskRepository { get(tx, id): Promise<Task | undefined>; save(tx, t: Task): Promise<void>; list(tx, filter: { scope: RecordScope; ownerMemberId?: string; status?: TaskStatus; kind?: TaskKind; bucket?: 'OVERDUE' | 'TODAY' | 'UPCOMING'; at: Date; cursor?: string; limit: number }): Promise<{ items: Task[]; nextCursor?: string }>; openForSubject(tx, type, id): Promise<Task[]>; escalationCandidates(tx, now: Date, limit: number): Promise<Task[]>; reassignOwner(tx, from: string, to: string): Promise<number> }
export interface OpportunityRepository { get(tx, id): Promise<Opportunity | undefined>; save(tx, o: Opportunity): Promise<void>; board(tx, filter: { scope: RecordScope; ownerMemberId?: string; productInterest?: ProductLine }): Promise<Opportunity[]>; findByProposal(tx, proposalId: string): Promise<Opportunity | undefined>; reassignOwner(tx, from, to): Promise<number>; relinkParty(tx, from, to): Promise<number> }
export interface RoutingRuleRepository { list(tx): Promise<RoutingRule[]>; replaceAll(tx, rules: RoutingRule[]): Promise<void>; cursor(tx, ruleId: string): Promise<string | undefined>; setCursor(tx, ruleId: string, memberId: string): Promise<void> }
export interface LeadImportRepository { findBatchByChecksum(tx, checksum: string): Promise<LeadImportBatch | undefined>; saveBatch(tx, b: LeadImportBatch): Promise<void>; rowSeen(tx, rowHash: string): Promise<boolean>; markRow(tx, rowHash: string, batchId: string): Promise<void> }
export interface PublicLeadGuard { check(input: { ipHash: string; honeypot?: string; at: Date }): void }   // honeypot filled → ValidationError('spam_detected'); > 10 submissions per ipHash per 10 min → RateLimitedError('public_lead_rate_limited')
// From other modules (injected tokens): PARTY_FACADE (M03), SELLER_DIRECTORY + RECORD_SCOPE_PROVIDER (M02), TENANT_DIRECTORY (M01: crmMode), ENTITLEMENT_CHECKER (M01: 'customers' metering for SOLO)
```

## 5. Application services

### 5.1 LeadCaptureService (LA-2: validated, deduplicated, consented, attributed, assigned)
```ts
export interface CaptureLeadInput {
  fullName: string; mobile?: string; email?: string;            // at least one contact
  productInterest: ProductLine; pincode?: string; language?: string;
  source: LeadSource; campaignId?: string; referrerPartyId?: string; micrositeMemberId?: string; touchRef?: string;
  consent: { granted: boolean; noticeVersion: string; channels: Array<'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL'>; purposes: Array<'SERVICE' | 'MARKETING'>; evidenceRef?: string };
}
export class LeadCaptureService {
  capture(input: CaptureLeadInput, origin: { kind: 'STAFF'; principal: Principal } | { kind: 'PUBLIC'; ipHash: string; honeypot?: string }): Promise<CaptureLeadResult>
}
export interface CaptureLeadResult { leadId: string; partyId: string; deduplicated: boolean; ownerMemberId?: string; routingReason: string; possibleMatches: number }
```
Steps (one unit of work, outbox + audit inside):
1. Public origin → `PublicLeadGuard.check`; public consent must be `granted: true` (`ValidationError('consent_required')`); staff may capture with `granted: false` (lead becomes do-not-contact for marketing).
2. `PartyFacade.findOrCreate({ …, onDuplicate: 'create', source: { kind: 'LEAD' } })` — a new prospect party; candidates are queued by M03 and surfaced on the lead as `possibleMatches`.
3. **Lead dedup**: an open lead for the same party, or for any party sharing the primary contact hash, created within 30 days → append `RE_ENQUIRY` activity + `touch()` → return `{ deduplicated: true }` (no new lead, no routing).
4. Consent: one `recordConsent` per (purpose, channel) with source `WEB_FORM` (public) or `ASSISTED` (staff).
5. `Lead.capture`; routing (§3.6) unless solo; `CrmPort.createLead`; cadence first task; events `crm.lead.created` `{ leadId, partyId, source, campaignId, productInterest }` and `crm.lead.routed` `{ leadId, ownerMemberId, ruleId }` or `crm.lead.unassigned`.
6. SOLO tenants consume `customers` usage (M01) for a new party.

### 5.2 Other services

| Service | Method | Rules |
|---|---|---|
| `LeadService` | `get(id, principal)` → `LeadDetailView`; `list(filter, principal)`; `stats(principal)` | record scope via M02; out-of-scope → 404 |
| | `transition(id, { to, lostReason? }, principal)` | builds `StageRuleContext` (activities + consent via `PartyFacade.contactability(… 'CALL','SERVICE')` → consentRecorded); stage-change activity; event `crm.lead.stage_changed` `{ leadId, from, to }` |
| | `qualify(id, qualification)` | `SensitiveContentGuard` on `existingCover` |
| | `assign(id, memberId, principal)` / `bulkAssign(ids, memberId)` | target must be in `SellerDirectory.eligibleSellers` for the lead's line/product (else per-lead `skipped` with reason 'Ineligible: licence or product scope'); `ASSIGNMENT` activity; resets SLA when not yet responded; event `crm.lead.assigned`. Bulk returns `{ assigned: string[], skipped: [{ leadId, reason }] }` |
| | `linkToCustomer(id, existingPartyId)` | `PartyFacade.absorb(lead.partyId → existingPartyId)`; `lead.relinkParty`; event `crm.lead.party_linked` |
| | `setTemperature(id, t)` | |
| `ActivityService` | `log(subject, input)` | guard; owner's first outbound activity → `recordResponse`; CALL outcome → cadence tasks; `clientRef` duplicate → return existing (offline replay safe); event `crm.activity.logged` `{ subjectType, subjectId, kind, outcome }` (no summary) |
| `ConversionService` | `convert(leadId, { partyChoice: 'LEAD_PARTY' \| { existingPartyId }, productInterest, expectedPremiumPaise, startStage })` | lead QUALIFIED; optional absorb; `Opportunity.open` with attribution copied; `lead.markConverted`; events `crm.lead.converted`, `crm.opportunity.created`; returns `{ opportunityId, partyId }` |
| `OpportunityService` | `board(filter, principal)` → columns `{ stage, count, totalExpectedPremiumPaise, items }` for the four open stages + ISSUED/LOST counts; `move(id, to)`; `markLost(id, reason)`; `onPolicyIssued(event)` (subscriber: `proposal.policy.issued` `{ proposalId, opportunityId?, policySaleId }` → `markIssued`, event `crm.opportunity.issued`) | HTTP can never set ISSUED |
| `TaskService` | `create`, `list(bucketed)`, `complete(id, outcome)`, `reassign`, `reschedule`; `escalateOverdue(now)` job: `needsEscalation` → `markEscalated` + event `crm.task.escalated` `{ taskId, ownerMemberId }` | |
| `RoutingService` | `rules()`, `replaceRules(rules)` (priorities unique, ≤ 50 rules; audit; event `crm.routing.rules_updated`), `simulate(facts)` → `RoutingDecision` (no side effects, cursor not advanced), `capacity()` → `[{ memberId, displayName, salespersonType, openLeadsToday, capacityPerDay, available: boolean, reason? }]` | |
| `MyWorkService` | `today(principal)` → `{ items: MyWorkItem[], counts: { overdue, today, hotLeads } }` | composer degrades per contributor |
| `LeadImportService` | `preview(input)` → `{ valid: number; duplicates: number; rejected: Array<{ row: number; reasons: string[] }> }`; `commit(input)` → `{ batchId, imported, duplicates, rejected, skippedAlreadyImported }` | input `{ fileChecksum, sourceTag, consentBasis: 'CAPTURED_AT_EVENT' \| 'NONE', noticeVersion?, rows: Array<{ fullName, mobile?, email?, productInterest?, pincode? }> (≤ 5000) }`; row validation (invalid mobile, missing contact, consentBasis CAPTURED_AT_EVENT requires noticeVersion); `NONE` → parties imported with a `DND`-style marketing withdrawal; re-running the same file (same checksum) or rows already seen (row hash) skips them; each valid row goes through the same capture path with source `IMPORT`; optional `route: boolean` |
| `CrmSubscribers` | `distribution.member.exited` → reassign open leads, tasks, opportunities to `transferToMemberId` (or unassign); `party.party.merged` → relink; `proposal.policy.issued` → opportunity issued; SLA sweep job: breached leads → event `crm.lead.sla_breached` + `NOTIFY_THEN_REASSIGN` → re-route excluding the current owner after `reassignAfterMinutes` | all handlers idempotent via kernel `Inbox` |

## 6. API (`/api/v1`; ✱ = `@Idempotent()`)

| Method | Path | Permission | Request → Response |
|---|---|---|---|
| POST ✱ | `/leads` | `crm.lead.write` | `CaptureLeadInput` → 201 `CaptureLeadResult` (200 when `deduplicated`) |
| POST ✱ | `/public/leads` | public, host tenant | `CaptureLeadInput & { website?: string /* honeypot */ }` → 202 `{ received: true }` (never reveals dedup or owner) |
| GET | `/leads?stage=&owner=&product=&source=&sla=&q=&sort=&limit=&cursor=` | `crm.lead.read` | `{ items: LeadListItem[], nextCursor? }` — `LeadListItem = { id, partyId, name, mobileMasked?, productInterest, source, campaignId?, ownerMemberId?, ownerName?, stage, temperature, slaState, slaDueAt?, consent: 'granted' \| 'not_given', createdAt }` |
| GET | `/leads/stats` | `crm.lead.read` | `LeadStats` |
| GET | `/leads/{id}` | `crm.lead.read` | `LeadDetailView = LeadListItem & { contact: { mobileMasked?, emailMasked?, preferredChannel? }, pincode?, qualification, attribution, stageHistory, stageRules: { [stage]: { met: boolean; missing: string[] } }, possibleMatches: DuplicateCandidateView[], consentSummary, activities: Activity[] (latest 50), openTasks: TaskView[], convertedOpportunityId?, syncState, version }` |
| POST ✱ | `/leads/{id}/stage-transitions` | `crm.lead.write` | `{ to, lostReason? }` → `LeadDetailView` / 422 `stage_rule_failed` `{ missing }` |
| PUT | `/leads/{id}/qualification` | `crm.lead.write` | `Qualification` → `LeadDetailView` |
| POST ✱ | `/leads/{id}/assignments` | `crm.lead.assign` | `{ memberId }` → `LeadDetailView` / 422 `assignee_ineligible` |
| POST ✱ | `/leads/bulk-assignments` | `crm.lead.assign` | `{ leadIds (≤ 200), memberId }` → `{ assigned, skipped }` |
| POST ✱ | `/leads/{id}/activities` | `crm.activity.write` | `{ kind, outcome?, summary?, occurredAt?, clientRef? }` → 201 `Activity` |
| POST ✱ | `/leads/{id}/party-link` | `crm.lead.write` | `{ partyId }` → `LeadDetailView` |
| POST ✱ | `/leads/{id}/conversion` | `crm.lead.convert` | `{ partyChoice, productInterest, expectedPremiumPaise, startStage }` → 201 `{ opportunityId, partyId }` |
| GET | `/opportunities?view=board&owner=&product=` | `crm.opportunity.read` | `{ columns: BoardColumn[], closed: { issued: number, lost: number }, stats: { openCount, openExpectedPremiumPaise, medianDaysToIssue: number \| null, winRate90d: number \| null } }` |
| POST ✱ | `/opportunities/{id}/stage-transitions` | `crm.opportunity.write` | `{ to }` → `OpportunityView` (422 `issued_requires_insurer_confirmation`) |
| POST ✱ | `/opportunities/{id}/loss` | `crm.opportunity.write` | `{ reason }` → `OpportunityView` |
| GET | `/tasks?mine=true&bucket=&kind=&owner=&limit=&cursor=` | `crm.task.read` | `{ groups: [{ bucket, items: TaskView[] }], counts: { overdue, today, upcoming } }` |
| POST ✱ | `/tasks` | `crm.task.write` | `{ subjectType, subjectId, kind, title, dueAt, ownerMemberId? }` → 201 `TaskView` |
| PATCH | `/tasks/{id}` (`If-Match`) | `crm.task.write` | `{ status?: 'DONE' \| 'CANCELLED', outcome?, dueAt?, ownerMemberId? }` → `TaskView` |
| GET / PUT | `/routing-rules` | `crm.routing.read` / `crm.routing.write` | `{ rules: RoutingRule[] }` |
| POST | `/routing-rules/simulations` | `crm.routing.read` | `LeadRoutingFacts` (minus derived) → `RoutingDecision` (with names) |
| GET | `/routing/capacity` | `crm.routing.read` | `{ items: CapacityRow[] }` |
| GET | `/my-work` | authenticated member | `{ items: MyWorkItem[], counts }` |
| POST | `/lead-imports/previews` | `crm.import` | import input → preview |
| POST ✱ | `/lead-imports` | `crm.import` | import input → 201 commit result |

Permissions: `SALESPERSON, SOLO_OWNER → crm.lead.read, crm.lead.write, crm.lead.convert, crm.activity.write, crm.task.*, crm.opportunity.read, crm.opportunity.write` · `BRANCH_MANAGER, SALES_MANAGER → crm.* except crm.routing.write` · `TENANT_ADMIN → crm.*` · `OPS → crm.lead.read, crm.lead.assign, crm.import, crm.task.*` · `CMS_*` none.

## 7. M04b — Twenty projection and sync (HLD §6, §8, §12, G6)

```ts
export interface TwentyClient {                                       // port; per-workspace API key resolved from the tenant directory only (G6)
  upsert(workspace: WorkspaceRef, object: 'person' | 'lead' | 'opportunity' | 'task' | 'note', externalRef: string | undefined, fields: Record<string, unknown>): Promise<{ id: string; workspaceId: string }>
}
export interface WorkspaceRef { tenantId: string; workspaceId: string; apiKeySecretRef: string }
export class HttpTwentyClient implements TwentyClient   // fetch, timeout 5 s, asserts response workspaceId === requested (else DependencyUnavailableError and security log 'security.twenty_workspace_mismatch'); wrapped with traced(…, 'twenty')
export class FakeTwentyClient implements TwentyClient    // in-memory, can be set to fail
export class TwentyProjector {                           // minimisation per HLD §8 — pure functions
  person(p: PartySummary): Record<string, unknown>       // name, masked phone, masked email, language, core_party_id, can_contact — never DOB/ID/address
  lead(l: LeadProps): Record<string, unknown>
  opportunity(o: OpportunityProps): Record<string, unknown>   // stage + premium band ('<15k','15-30k','30-50k','>50k'), not exact premium
  task(t: TaskProps): Record<string, unknown>
}
export class CrmSyncWorker {
  handle(event: DomainEvent<{ object: string; id: string }>): Promise<void>
  // loads record, projects, upserts, stores externalRef + syncState 'synced'; failure → syncState 'failed', rethrow (outbox relay retries; dead-letter after 3)
}
```
Inbound: `POST /api/v1/webhooks/twenty/{workspaceId}` (`@Public`): HMAC-SHA256 of raw body with the workspace secret in `x-twenty-signature` (timing-safe); timestamp header `x-twenty-timestamp` within 5 minutes (replay window); workspace → tenant from directory; event id dedup via kernel `Inbox`; field ownership: Twenty-owned fields (lead/opportunity owner, tags, task status) are applied to Core if the Core record is not newer; Core-owned fields (person name/contacts) become a change request (`crm.change_request.created`) and are reverted on the next projection. Invalid signature → 401 + security log.

Degraded mode: when the Twenty circuit is open, writes still succeed (`syncState: 'pending'`) and the list/detail APIs show `syncState`.

Implementation decisions (M04b build, 2026-10-03):
- **Signature covers the timestamp:** `x-twenty-signature` = hex HMAC-SHA256 of `"<x-twenty-timestamp>.<raw body>"` (not the body alone), so a captured request cannot be replayed with a fresh timestamp. Unknown workspace and bad signature both answer 401 `invalid_signature`; stale → 401 `stale_webhook`; malformed payload with a valid signature → 400 `invalid_webhook`. Response `{ outcome: applied | unchanged | stale | ineligible_owner | unknown_record | change_request | duplicate }`.
- **Sync bookkeeping is separate from the aggregate** (`CrmSyncStateRepository`, the sync_state/external_ref columns updated without a version bump), so a background sync never invalidates a user's `If-Match`. Lead list and detail read `syncState` from it.
- **Workspace mismatch** is asserted by `CrmSyncWorker` for every client (not only `HttpTwentyClient`), so it is testable with the fake.
- **Owner changes from Twenty** apply only if the new owner is still eligible for the product (M02 eligibility); otherwise `ineligible_owner` and Core keeps its owner. Freshness compares the event's `updatedAt` with the lead's `updatedAt` / opportunity's `stageEnteredAt` / task's `createdAt`.
- **Person** sync is enqueued the first time a lead for the party is saved; a Core-owned edit in Twenty emits `crm.change_request.created` with field names only and re-projects the person.
- **Sync state storage (Postgres, 041):** a dedicated `crm_sync_state` table (tenant, object, id, state, external_ref, attempts, last_error) instead of the per-table `sync_state`/`external_ref` columns, because persons are keyed by party id and retries need attempts/last error; those columns in 040 are unused.
- **Retry policy** is the kernel outbox's: 3 attempts then dead-letter (no separate circuit breaker at launch). The kernel now schedules the outbox relay (`OutboxRelayScheduler`, 1 s, off in tests) and excludes dead-lettered events from fetches.
- **Dev/test wiring:** `DerivedTwentyWorkspaceDirectory` (workspace `ws_<tenantId>` as created by the M01 stub provisioner; per-workspace webhook secret derived by domain-separated HMAC) and `FakeTwentyClient`. Production needs the provisioned workspace record and a secret-manager lookup before `HttpTwentyClient` is wired.

## 8. DDL — `apps/core/migrations/040_crm.sql`
```sql
create table if not exists crm_lead (
  id text primary key, tenant_id text not null references tenant(id), party_id text not null references party(id),
  product_interest text not null, pincode text, language text,
  stage text not null check (stage in ('NEW','CONTACTED','QUALIFIED','CONVERTED','LOST')),
  temperature text not null, owner_member_id text references member(id), org_unit_id text, routed_by_rule_id text,
  attribution jsonb not null, qualification jsonb not null default '{}', lost_reason text,
  sla_due_at timestamptz, first_responded_at timestamptz, stage_history jsonb not null,
  converted_opportunity_id text, sync_state text not null default 'local', external_ref text,
  created_at timestamptz not null, updated_at timestamptz not null, version int not null default 1
);
create index if not exists crm_lead_owner_idx on crm_lead (tenant_id, owner_member_id, stage);
create index if not exists crm_lead_party_idx on crm_lead (tenant_id, party_id);
create index if not exists crm_lead_sla_idx on crm_lead (tenant_id, sla_due_at) where first_responded_at is null and stage in ('NEW','CONTACTED');
create table if not exists crm_activity (
  id text primary key, tenant_id text not null, subject_type text not null, subject_id text not null, kind text not null,
  outcome text, summary text, occurred_at timestamptz not null, actor_member_id text, client_ref text,
  unique (tenant_id, client_ref)
);
create index if not exists crm_activity_subject_idx on crm_activity (tenant_id, subject_type, subject_id, occurred_at desc);
create table if not exists crm_task (
  id text primary key, tenant_id text not null, owner_member_id text not null, subject_type text not null, subject_id text not null,
  kind text not null, title text not null, due_at timestamptz not null, status text not null check (status in ('OPEN','DONE','CANCELLED')),
  outcome text, source text not null, escalated_at timestamptz, created_at timestamptz not null, completed_at timestamptz,
  sync_state text not null default 'local', external_ref text, version int not null default 1
);
create index if not exists crm_task_owner_due_idx on crm_task (tenant_id, owner_member_id, status, due_at);
create table if not exists crm_opportunity (
  id text primary key, tenant_id text not null, party_id text not null references party(id), lead_id text references crm_lead(id),
  product_interest text not null, title text not null, expected_premium_paise bigint not null, currency char(3) not null default 'INR',
  stage text not null check (stage in ('DISCOVERY','QUOTE_SHARED','PROPOSAL_COMPLETE','INSURER_PENDING','ISSUED','LOST')),
  owner_member_id text not null, org_unit_id text, attribution jsonb, insurer_name text, lost_reason text, issued_policy_sale_id text,
  core_proposal_id text, stage_entered_at timestamptz not null, created_at timestamptz not null,
  sync_state text not null default 'local', external_ref text, version int not null default 1
);
create table if not exists crm_routing_rule (tenant_id text not null, id text not null, priority int not null, body jsonb not null, primary key (tenant_id, id), unique (tenant_id, priority));
create table if not exists crm_routing_cursor (tenant_id text not null, rule_id text not null, last_member_id text, primary key (tenant_id, rule_id));
create table if not exists crm_lead_import (id text primary key, tenant_id text not null, file_checksum text not null, source_tag text not null, summary jsonb not null, created_at timestamptz not null, unique (tenant_id, file_checksum));
create table if not exists crm_lead_import_row (tenant_id text not null, row_hash text not null, batch_id text not null, primary key (tenant_id, row_hash));
create table if not exists crm_public_lead_rate (tenant_id text not null, ip_hash text not null, window_start timestamptz not null, count int not null, primary key (tenant_id, ip_hash, window_start));
-- RLS tenant_isolation on all tables; grants to iap_app
```

## 9. Observability

| Event / metric | Notes |
|---|---|
| `crm.lead.created/routed/unassigned/assigned/stage_changed/converted/sla_breached/party_linked`, `crm.activity.logged`, `crm.task.escalated`, `crm.opportunity.created/issued/lost`, `crm.routing.rules_updated` | domain events — ids and enums only |
| `crm_leads_captured_total{source,deduplicated}` | counter |
| `crm_routing_decisions_total{method,outcome="assigned"\|"unassigned"}` | counter |
| `crm_lead_first_response_minutes` | histogram |
| `crm_sync_lag_seconds` gauge, `crm_sync_failures_total` | M04b; business monitor "sync drift" (HLD §16) |
| `crm.my_work.contributor_failed` | warn, degraded mode |
| `security.twenty_webhook_rejected`, `security.twenty_workspace_mismatch` | security |

## 10. Frontend (apps/web/src/features/crm)

| Route | Screen (wireframe) | Behaviour |
|---|---|---|
| `/crm/leads` | `LeadsWorkspaceScreen` (CRM01) | KPI tiles from `/leads/stats` (open, unassigned, SLA met 7d, lead→issued 90d "Insurer-confirmed only"); saved-view chips (All open, Unassigned, SLA breached, Mine); product/owner filters; new-lead side form (name, mobile, product, source, consent notice v2 checkbox) → "Create and route" → toast with owner/reason; grid with SLA timer chip and consent chip; multi-select bulk assign with "Ineligible owners are skipped by licence and product scope" and per-lead skipped reasons; empty state "No leads in this view." |
| `/crm/leads/:id` | `LeadRecordScreen` (CRM02) | Header (name, temperature chip, product, source, created, first response); owner select (reassign); stage bar with entry rules — attempting a blocked stage shows "To move to X, complete: …" from `stageRules.missing`; Call/WhatsApp (log activity); Convert sheet (create new vs link existing, product, expected premium, start stage; disabled with "Qualify the lead first" unless QUALIFIED); contact card (masked), consent card, possible-match banner (Link to customer / Not the same), attribution card ("Credited to source only when the insurer confirms issuance"), activity composer with call-outcome chips + timeline, qualification form, tasks list with + Task. |
| `/crm/pipeline` | `PipelineScreen` (CRM03) | KPI tiles; owner/product chips; Kanban columns DISCOVERY "Needs analysis", QUOTE_SHARED "Quoted", PROPOSAL_COMPLETE "Proposal", INSURER_PENDING "Insurer pending" with count and premium total; ←/→ move buttons; "Lost" with required reason sheet; no control to mark issued (copy: "Won is set only by the insurer's issuance confirmation"). |
| `/crm/tasks` | `TasksScreen` (CRM05) | My/Team tabs, type chips, groups Overdue/Today/Upcoming, tick to complete with outcome, "+ Task" form, cadence rules card (read-only text). |
| `/crm/routing` | `RoutingRulesScreen` (CRM07) | Ordered rule list (first match wins) with on/off; rule editor (conditions, method, pool, SLA, breach action, capacity); eligibility note copy; "Test a lead" form → decision (who and why); capacity table; Save (PUT). |
| `/crm/import` | `LeadImportScreen` (CRM08 import part) | Steps: upload CSV (parsed client-side) → map columns → validate (preview counts, rejected rows with reasons, download rejected CSV) → import (source tag required, consent basis) → result with batch id and "re-running the same file skips existing rows". Duplicates tab links to the M03 queue. |
| `/m/today` | `TodayScreen` (M01, CRM part) | Greeting, counts, my-work list with one-tap Call/WhatsApp/Log; EN/हि; offline: cached last response (sessionStorage, non-sensitive fields only) with OfflineBanner; queued "Log" actions stored with `clientRef` and replayed on reconnect. |
| `/m/leads`, `/m/leads/:id` | `MobileLeadsScreen` (M02), `MobileLeadScreen` (M16) | list/board toggle, filter chips, new-lead bottom sheet with consent; lead record with stage progress, qualify, next task, convert. |
| `/m/tasks` | `MyTasksScreen` (M17) | grouped by urgency, type filter, tick to log outcome. |

Implementation decisions (screens, 2026-10-03):
- **One-tap Call/WhatsApp on Today** open the lead record rather than dialling: list and my-work APIs only carry masked contacts by design, so a tap-to-dial needs a click-to-call / number-reveal endpoint (audited) — proposed for a later module; nothing on the device ever holds an unmasked number.
- **Offline**: Today caches an allow-list of my-work fields (no subtitle/contacts) in sessionStorage; queued logs hold ids and enums only, keep the clientRef assigned at queue time, are replayed on load and on `online`, dropped on 2xx/409 or a final 4xx (shown as rejected), and kept on network/408/429/5xx.
- **Tasks**: ticking a task (desktop and mobile) asks for an optional outcome before `PATCH status=DONE` with `If-Match`.
- **Routing editor**: priorities are renumbered from list order on save (so duplicates cannot be produced from the UI); the server's error message is shown verbatim.
- **Import**: mapping is limited to the fields the server row schema accepts (fullName, mobile, email, productInterest, pincode), auto-mapping uses exact header synonyms, empty cells are omitted, the rejected-row download is formula-safe (CSV injection).

## 11. Acceptance criteria

Domain
- **AC-M04-01** `Lead.capture`/`assign` set stage NEW, attribution and SLA due time; `slaState` returns none/pending/met/breached correctly at boundaries.
- **AC-M04-02** Lead stage moves follow the allowed table; CONVERTED only through conversion from QUALIFIED; LOST requires a reason; closed leads cannot move.
- **AC-M04-03** Default stage rules: CONTACTED requires a connected contact; QUALIFIED requires connected contact, qualification and consent; failures return the unmet rule labels.
- **AC-M04-04** `SensitiveContentGuard` rejects PAN, Aadhaar and card numbers in activity summaries and qualification notes.
- **AC-M04-05** Opportunity moves only one adjacent open stage at a time; HTTP/manual moves can never set ISSUED (`issued_requires_insurer_confirmation`); `markIssued` works only from PROPOSAL_COMPLETE or INSURER_PENDING via the insurer-confirmation path; LOST needs a reason from the list.
- **AC-M04-06** Routing: rules evaluated by priority, first matching rule that yields an eligible seller wins; each strategy picks as specified (round-robin wraps and persists its cursor; least-loaded uses load ratio; skill and territory preference; direct owner for microsite leads); capacity excludes full sellers; no eligible seller → unassigned with reason; solo tenants route to the owner.
- **AC-M04-07** Eligibility is always applied: POSPs never receive non-POS products, sellers on leave, inactive or with an expired licence for the line are skipped (uses M02 `SellerDirectory`).
- **AC-M04-08** Cadence: assignment creates the first-call task at the SLA due time; NO_ANSWER creates retries at +4 h then next day 10:00 IST and stops after the third attempt.
- **AC-M04-09** Task buckets (overdue/today/upcoming in IST) and 24-hour escalation (once) are correct.
- **AC-M04-10** My-work composer merges contributors by priority and due time and skips (with a warning log) a failing contributor.

Application / API
- **AC-M04-11** Capture (LA-2): public capture requires consent and passes anti-spam (honeypot, per-IP rate limit); consent records are written per purpose/channel; party created through `PartyFacade` with candidates surfaced as `possibleMatches`; lead routed and first task created; events emitted; response to public callers never reveals owner or dedup.
- **AC-M04-12** Lead dedup: a second enquiry for the same person (same party or shared primary contact) within 30 days adds a RE_ENQUIRY activity to the open lead and does not create or route a new lead.
- **AC-M04-13** Assignment and bulk assignment check eligibility and return per-lead skipped reasons; first response by the owner stops the SLA clock; SLA sweep emits `crm.lead.sla_breached` and re-routes after the configured delay when `NOTIFY_THEN_REASSIGN`.
- **AC-M04-14** Conversion creates (or links) the party and an opportunity with attribution carried over, marks the lead CONVERTED, and is refused before QUALIFIED.
- **AC-M04-15** Pipeline board returns the four open columns with counts and premium totals (paise), and closed counts; `proposal.policy.issued` marks the linked opportunity ISSUED exactly once (inbox dedup).
- **AC-M04-16** Activities with the same `clientRef` are stored once (offline replay); the owner's first outbound activity records first response.
- **AC-M04-17** Record scope: salespeople see only their leads/tasks/opportunities, managers their subtree; out-of-scope ids → 404; tenant isolation on every endpoint.
- **AC-M04-18** `distribution.member.exited` reassigns open leads, tasks and opportunities to the transfer target; `party.party.merged` relinks leads and opportunities.
- **AC-M04-19** Routing rules API validates unique priorities and limits, simulation returns who and why without side effects, capacity lists load and availability.
- **AC-M04-20** Lead import validates rows (invalid mobile, missing contact, missing consent notice), reports rejected rows with reasons, imports valid rows through the capture path with source IMPORT, and is idempotent by file checksum and row hash.
- **AC-M04-21** Postgres: migration applies; RLS isolates all CRM tables; `client_ref` uniqueness enforced. *(integration)*

M04b
- **AC-M04-22** Projection to Twenty is minimised (no DOB/ID/address, masked contacts, premium band only) and only for `crmMode = twenty`; solo tenants never enqueue sync.
- **AC-M04-23** Twenty down: lead capture and task writes succeed with `syncState: pending`; the worker retries and marks `synced` when the fake client recovers; a workspace-id mismatch in the response is rejected and security-logged.
- **AC-M04-24** Webhook: invalid signature → 401 + security log; stale timestamp rejected; duplicate event id processed once; Twenty-owned field (owner) applied; Core-owned field (name) produces a change request instead of overwriting.

Frontend
- **AC-M04-25** Leads workspace: KPI tiles, saved views, create-and-route form with consent, bulk assign with skipped reasons, SLA and consent chips, empty state.
- **AC-M04-26** Lead record: stage bar with blocked-move message listing missing rules, activity composer with outcomes, possible-match banner actions, convert sheet disabled until qualified, attribution note.
- **AC-M04-27** Pipeline: columns with counts and premium totals, adjacent moves, lost with required reason, no way to mark issued.
- **AC-M04-28** Tasks and My tasks: buckets, complete with outcome, type filters; Routing rules: edit, test a lead shows who and why, capacity table.
- **AC-M04-29** Today (mobile): my-work list with one-tap actions, EN/हि, offline banner, queued log actions replayed with the same `clientRef`.
- **AC-M04-30** Lead import wizard: mapping, preview counts, rejected-row download, commit result with batch id.

## 11. CR-001 additions — custom fields on leads and opportunities, attribution alignment

Kernel contract: M00 §16.5; definitions from M01 (`CUSTOM_FIELD_DEFINITIONS`, entities `lead`, `opportunity`).

### 11.1 Custom fields
- Domain: `LeadProps.customFields` and `OpportunityProps.customFields` (`CustomFieldValues`, default `{}`); `replaceCustomFields(values, now)` on both aggregates (keys of inactive definitions preserved; bumps `updatedAt`/version as other mutations do).
- `LeadCaptureService.capture`: `CaptureLeadInput.customFields?` accepted on the authenticated `POST /leads` only and validated against `lead` definitions before anything is written; `/public/leads` and lead imports never set custom fields (start as `{}`); a deduplicated capture does not change the existing lead's values.
- `LeadService.replaceCustomFields(principal, id, values, expectedVersion)` and `OpportunityService.replaceCustomFields(...)`: record scope (out of scope → 404), version (412), validate, save, audit `crm.custom_fields.replaced` with `{ subjectType, subjectId, keys }` only.
- `OpportunityService.get(principal, id)` → `OpportunityView & { customFields }` (scoped; 404).
- Views: `LeadDetailView.customFields` and the opportunity detail use `CustomFieldValidator.visible`; `LeadListItem.customFields` uses `CustomFieldValidator.mask`.
- Conversion does not copy lead values to the opportunity (different definitions).
- M04b: the Twenty projection never contains custom-field values (`TwentyProjector` field lists unchanged); logs carry keys only.

| Method | Path | Permission | Request / Response |
|---|---|---|---|
| POST ✱ | `/leads` | `crm.lead.write` | `CaptureLeadInput` gains `customFields?: Record<string, string \| number \| boolean \| null>`; 400 `invalid_custom_fields` |
| PUT | `/leads/{id}/custom-fields` (`If-Match`) | `crm.lead.write` | `{ customFields }` → `LeadDetailView` + `ETag`; 400 `invalid_custom_fields`; 404; 412 |
| GET | `/opportunities/{id}` | `crm.opportunity.read` | `OpportunityView & { customFields }` + `ETag`; 404 |
| PUT | `/opportunities/{id}/custom-fields` (`If-Match`) | `crm.opportunity.write` | `{ customFields }` → `OpportunityView & { customFields }` + `ETag`; 400; 404; 412 |

DDL — `apps/core/migrations/042_crm_custom_fields.sql`:
```sql
alter table crm_lead add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table crm_lead add column if not exists custom_schema_version int not null default 1;
alter table crm_opportunity add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table crm_opportunity add column if not exists custom_schema_version int not null default 1;
```

### 11.2 Attribution alignment (CR-001 step 5)
Platform sales (M09) and imported policies (M07) record `business_source` (kernel `BusinessSource`) and `referred_by`. For platform sales, `businessSource = businessSourceForLeadSource(lead.attribution.source)` and `referredBy.partyId = lead.attribution.referrerPartyId` (name = the referrer party's display name). M04 exposes this through `OPPORTUNITY_LOOKUP` by adding `attribution?: { source: LeadSource; referrerPartyId?: string }` (from the converted lead; absent for opportunities without a lead). No change to lead capture. This snapshot field is added together with its consumer in the M09 build (no unused code now).

### 11.3 Frontend
`CustomFieldsSection` (shared component in `apps/web/src/features/party/components/`, reused by CRM): read view of label/value pairs (localised labels, money as ₹, enum labels, P2 shown as entered on detail screens) and an edit sheet generating inputs per type, required markers and inline `invalid_custom_fields` errors, saving with `If-Match`. Shown on `/crm/leads/:id` (lead entity) and `/crm/customers/:id` (party entity) when the tenant has active definitions for the entity; hidden otherwise.

- **AC-CR001-05** (M04 part) With P0/P1/P2 custom-field values on a lead, opportunity and party, the Twenty projection payloads contain none of them and no log line contains a value.
- **AC-CR001-08** (M04 part) `POST /leads` with valid `customFields` stores them; invalid → 400 before any write (no party/lead created); `PUT /leads/{id}/custom-fields` and `PUT /opportunities/{id}/custom-fields` replace values with `If-Match`; `GET /opportunities/{id}` returns them; list masks P2; tenant isolation; Postgres persistence *(integration)*. Web: the section renders values per type and saves edits; invalid fields are shown inline.
