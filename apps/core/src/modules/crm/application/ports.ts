import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { Lead, LeadSource, LeadStage, ProductLine } from '../domain/lead';
import { Activity } from '../domain/activity';
import { Task, TaskKind, TaskStatus } from '../domain/task';
import { Opportunity, OpportunityStage } from '../domain/opportunity';
import { Principal } from '../../../kernel/tenancy/principal';
import { RoutingRule } from '../domain/routing/routing-rule';
import { RecordScope } from '../../distribution/application/ports';

export type { Transaction, RecordScope };
export { SELLER_DIRECTORY, RECORD_SCOPE_PROVIDER } from '../../distribution/application/ports';
export type { SellerDirectory, RecordScopeProvider, EligibleSeller } from '../../distribution/application/ports';
export { PARTY_FACADE } from '../../party/application/ports';
export type { PartyFacade, PartySummary, DuplicateCandidateView } from '../../party/application/ports';
export { TENANT_DIRECTORY, ENTITLEMENT_CHECKER } from '../../tenancy/application/ports';
export type { TenantDirectory, EntitlementChecker } from '../../tenancy/application/ports';

export interface LeadFilter {
  scope: RecordScope;
  stage?: LeadStage[];
  ownerMemberId?: string | 'unassigned';
  productInterest?: ProductLine;
  source?: LeadSource;
  slaState?: 'breached' | 'pending';
  sort?: 'createdAt' | '-createdAt' | 'slaDueAt';
  at: Date;
  cursor?: string;
  limit: number;
}

export interface LeadStats {
  open: number;
  unassigned: number;
  slaMetPct7d: number | null;
  leadToIssuedPct90d: number | null;
}

export interface LeadRepository {
  get(tx: Transaction, id: string): Promise<Lead | undefined>;
  /** Optimistic version; calls lead.markSaved(). */
  save(tx: Transaction, lead: Lead): Promise<void>;
  /** Open = stage not CONVERTED/LOST, created on or after `since`. */
  findOpenByParties(tx: Transaction, partyIds: readonly string[], since: Date): Promise<Lead | undefined>;
  list(tx: Transaction, filter: LeadFilter): Promise<{ items: Lead[]; nextCursor?: string }>;
  countOpenToday(tx: Transaction, memberIds: readonly string[], dayStart: Date): Promise<Record<string, number>>;
  stats(tx: Transaction, scope: RecordScope, now: Date): Promise<LeadStats>;
  openForOwner(tx: Transaction, memberId: string): Promise<Lead[]>;
  forParty(tx: Transaction, partyId: string): Promise<Lead[]>;
  slaBreachCandidates(tx: Transaction, now: Date, limit: number): Promise<Lead[]>;
}

export interface ActivityRepository {
  /** clientRef is unique per tenant: a replay returns the stored activity with duplicate=true. */
  add(tx: Transaction, a: Activity): Promise<{ duplicate: boolean; activity: Activity }>;
  forSubject(tx: Transaction, type: Activity['subjectType'], id: string, limit: number): Promise<Activity[]>;
  countCallAttempts(tx: Transaction, leadId: string): Promise<number>;
}

export interface TaskListFilter {
  /** undefined = every owner (tenant scope); otherwise only these owners. */
  ownerMemberIds?: readonly string[];
  status?: TaskStatus;
  kind?: TaskKind;
  at: Date;
  cursor?: string;
  limit: number;
}

export interface TaskRepository {
  get(tx: Transaction, id: string): Promise<Task | undefined>;
  save(tx: Transaction, t: Task): Promise<void>;
  list(tx: Transaction, filter: TaskListFilter): Promise<{ items: Task[]; nextCursor?: string }>;
  openForSubject(tx: Transaction, type: Task['props']['subjectType'], id: string): Promise<Task[]>;
  openForOwner(tx: Transaction, memberId: string): Promise<Task[]>;
  escalationCandidates(tx: Transaction, now: Date, limit: number): Promise<Task[]>;
}

export interface OpportunityRepository {
  get(tx: Transaction, id: string): Promise<Opportunity | undefined>;
  save(tx: Transaction, o: Opportunity): Promise<void>;
  board(tx: Transaction, filter: { scope: RecordScope; ownerMemberId?: string; productInterest?: ProductLine }): Promise<Opportunity[]>;
  findByProposal(tx: Transaction, proposalId: string): Promise<Opportunity | undefined>;
  openForOwner(tx: Transaction, memberId: string): Promise<Opportunity[]>;
  forParty(tx: Transaction, partyId: string): Promise<Opportunity[]>;
}

export interface RoutingRuleRepository {
  list(tx: Transaction): Promise<RoutingRule[]>;
  replaceAll(tx: Transaction, rules: RoutingRule[]): Promise<void>;
  cursor(tx: Transaction, ruleId: string): Promise<string | undefined>;
  setCursor(tx: Transaction, ruleId: string, memberId: string): Promise<void>;
}

export interface LeadImportBatch {
  id: string;
  fileChecksum: string;
  sourceTag: string;
  summary: { imported: number; duplicates: number; rejected: number; skippedAlreadyImported: number };
  createdAt: string;
}

export interface LeadImportRepository {
  findBatchByChecksum(tx: Transaction, checksum: string): Promise<LeadImportBatch | undefined>;
  saveBatch(tx: Transaction, b: LeadImportBatch): Promise<void>;
  rowSeen(tx: Transaction, rowHash: string): Promise<boolean>;
  markRow(tx: Transaction, rowHash: string, batchId: string): Promise<void>;
}

/** Anti-spam for public capture: honeypot → ValidationError('spam_detected'); > 10 per ipHash per 10 min → RateLimitedError. */
export interface PublicLeadGuard {
  check(tx: Transaction, input: { ipHash: string; honeypot?: string; at: Date }): Promise<void>;
}

/** CRM Port (HLD D5): every engagement write goes through it so M04b can project to Twenty. */
export interface CrmPort {
  saveLead(tx: Transaction, lead: Lead): Promise<void>;
  saveTask(tx: Transaction, task: Task): Promise<void>;
  saveOpportunity(tx: Transaction, opportunity: Opportunity): Promise<void>;
}

/** Whether a product may be sold by a POSP. M05's catalogue replaces the default with the product flag. */
/** Whether a POSP may handle leads for this product interest (backed by M05 version flags). */
export interface PosEligibilityPolicy {
  isPosEligible(product: ProductLine): Promise<boolean>;
}

/** Published for M06: an opportunity as seen by a caller, or undefined when missing or outside the caller's record scope. */
export interface OpportunitySnapshot {
  id: string;
  partyId: string;
  ownerMemberId: string;
  orgUnitId?: string;
  productInterest: ProductLine;
  stage: OpportunityStage;
}

export interface OpportunityLookup {
  inScope(tx: Transaction, principal: Principal, opportunityId: string): Promise<OpportunitySnapshot | undefined>;
}

export const OPPORTUNITY_LOOKUP = Symbol('OpportunityLookup');
export const POS_ELIGIBILITY = Symbol('PosEligibilityPolicy');
export const LEAD_REPOSITORY = Symbol('LeadRepository');
export const ACTIVITY_REPOSITORY = Symbol('ActivityRepository');
export const TASK_REPOSITORY = Symbol('TaskRepository');
export const OPPORTUNITY_REPOSITORY = Symbol('OpportunityRepository');
export const ROUTING_RULE_REPOSITORY = Symbol('RoutingRuleRepository');
export const LEAD_IMPORT_REPOSITORY = Symbol('LeadImportRepository');
export const PUBLIC_LEAD_GUARD = Symbol('PublicLeadGuard');
export const CRM_PORT_FACTORY = Symbol('CrmPortFactory');
export const MY_WORK_CONTRIBUTORS = Symbol('MyWorkContributors');
export const CADENCE_POLICY = Symbol('CadencePolicy');
export const STAGE_RULES = Symbol('StageRules');

export interface CrmPortFactory {
  forTenant(tenantId: string): Promise<CrmPort>;
}
