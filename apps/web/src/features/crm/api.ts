import { ApiClient } from '../../lib/api/api-client';

// Lead types from spec §3
export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';
export type ProductLine = 'TERM_LIFE' | 'SAVINGS_LIFE' | 'HEALTH' | 'HEALTH_FLOATER' | 'CHILD' | 'RETIREMENT' | 'MOTOR' | 'OTHER';
export type LeadSource = 'WEB_FORM' | 'MICROSITE' | 'REFERRAL' | 'WALK_IN' | 'PHONE' | 'EVENT' | 'CAMPAIGN' | 'IMPORT' | 'API';
export type Temperature = 'HOT' | 'WARM' | 'COLD';
export type CallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'CALL_BACK' | 'WRONG_NUMBER' | 'NOT_INTERESTED';
export type LostReason = 'BOUGHT_ELSEWHERE' | 'PREMIUM_TOO_HIGH' | 'DECLINED_BY_UNDERWRITING' | 'NOT_REACHABLE' | 'POSTPONED' | 'NOT_INTERESTED' | 'OTHER';
export type TaskKind = 'CALL' | 'WHATSAPP' | 'MEETING' | 'DOCUMENT' | 'FOLLOW_UP' | 'RENEWAL';
export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type OpportunityStage = 'DISCOVERY' | 'QUOTE_SHARED' | 'PROPOSAL_COMPLETE' | 'INSURER_PENDING' | 'ISSUED' | 'LOST';
export type MyWorkKind = 'TASK' | 'HOT_LEAD' | 'SLA_AT_RISK' | 'DUE' | 'PROPOSAL' | 'BIRTHDAY';

export interface MyWorkItem {
  kind: MyWorkKind;
  id: string;
  title: string;
  subtitle?: string;
  dueAt?: string;
  priority: number;
  subject: { type: string; id: string };
  actions: Array<'CALL' | 'WHATSAPP' | 'LOG' | 'OPEN'>;
}

export interface Qualification {
  need?: 'PROTECTION' | 'TAX_SAVING' | 'CHILD_EDUCATION' | 'RETIREMENT' | 'HEALTH_COVER' | 'VEHICLE';
  budgetBand?: 'LT_15K' | '15K_30K' | 'GT_30K';
  timeline?: 'THIS_MONTH' | '1_3_MONTHS' | 'EXPLORING';
  existingCover?: string;
}

export interface Activity {
  id: string;
  subjectType: 'LEAD' | 'PARTY' | 'OPPORTUNITY';
  subjectId: string;
  kind: string;
  outcome?: CallOutcome;
  summary?: string;
  occurredAt: string;
  actorMemberId?: string;
  clientRef?: string;
}

export interface LeadListItem {
  id: string;
  partyId: string;
  name: string;
  mobileMasked?: string;
  productInterest: ProductLine;
  source: LeadSource;
  campaignId?: string;
  ownerMemberId?: string;
  ownerName?: string;
  stage: LeadStage;
  temperature: Temperature;
  slaState: 'met' | 'breached' | 'pending' | 'none';
  slaDueAt?: string;
  consent: 'granted' | 'not_given';
  createdAt: string;
}

export interface DuplicateCandidateView {
  id: string;
  displayName: string;
}

export interface LeadDetailView extends LeadListItem {
  contact?: {
    mobileMasked?: string;
    emailMasked?: string;
    preferredChannel?: string;
  };
  pincode?: string;
  qualification: Qualification;
  attribution: {
    source: LeadSource;
    campaignId?: string;
    firstTouch: { channel: string; at: string };
    lastTouch: { channel: string; at: string };
  };
  stageHistory: Array<{ from?: LeadStage; to: LeadStage; at: string; by: string }>;
  stageRules: Record<string, { met: boolean; missing: string[] }>;
  possibleMatches: DuplicateCandidateView[];
  consentSummary: Array<{ purpose: string; channel: string; granted: boolean }>;
  activities: Activity[];
  openTasks: TaskView[];
  convertedOpportunityId?: string;
  syncState: 'synced' | 'pending' | 'failed' | 'local';
  version: number;
}

export interface LeadStats {
  open: number;
  unassigned: number;
  slaMetPct7d: number | null;
  leadToIssuedPct90d: number | null;
}

export interface TaskView {
  id: string;
  ownerMemberId: string;
  subjectType: 'LEAD' | 'PARTY' | 'OPPORTUNITY' | 'DUE' | 'PROPOSAL';
  subjectId: string;
  kind: TaskKind;
  title: string;
  dueAt: string;
  status: TaskStatus;
  outcome?: string;
  source: string;
  escalatedAt?: string;
  createdAt: string;
  completedAt?: string;
  version: number;
}

export interface BoardColumn {
  stage: OpportunityStage;
  count: number;
  totalExpectedPremiumPaise: number;
  items: OpportunityView[];
}

export interface OpportunityView {
  id: string;
  partyId: string;
  leadId?: string;
  productInterest: ProductLine;
  title: string;
  expectedPremium: { amountPaise: number; currency: 'INR' };
  stage: OpportunityStage;
  ownerMemberId: string;
  lostReason?: LostReason;
  issuedPolicySaleId?: string;
  stageEnteredAt: string;
  createdAt: string;
  version: number;
}

export interface BoardResponse {
  columns: BoardColumn[];
  closed: { issued: number; lost: number };
  stats: {
    openCount: number;
    openExpectedPremiumPaise: number;
    medianDaysToIssue: number | null;
    winRate90d: number | null;
  };
}

// Routing
export type RoutingMethod = 'ROUND_ROBIN' | 'LEAST_LOADED' | 'TERRITORY' | 'SKILL' | 'DIRECT_OWNER';

export interface RuleCondition {
  field: 'productInterest' | 'line' | 'source' | 'pincodePrefix' | 'campaignId' | 'language';
  op: 'eq' | 'in' | 'startsWith';
  value: string | string[];
}

export interface RoutingRule {
  id: string;
  priority: number;
  name: string;
  active: boolean;
  conditions: RuleCondition[];
  method: RoutingMethod;
  targetOrgUnitId?: string;
  slaMinutes: number;
  onBreach: 'NOTIFY_MANAGER' | 'NOTIFY_THEN_REASSIGN';
  reassignAfterMinutes?: number;
  capacityPerPerson?: number;
}

export interface RoutingDecision {
  memberId?: string;
  orgUnitId?: string;
  ruleId?: string;
  slaMinutes?: number;
  memberName?: string;
  reason: string;
  skipped: Array<{ memberId: string; reason: string }>;
}

export interface CapacityRow {
  memberId: string;
  displayName: string;
  salespersonType: string;
  openLeadsToday: number;
  capacityPerDay: number;
  available: boolean;
  reason?: string;
}

// Lead Import
export interface LeadImportResult {
  batchId: string;
  imported: number;
  duplicates: number;
  rejected: number;
  skippedAlreadyImported: number;
}

export interface RejectedRow {
  row: number;
  reasons: string[];
}

export interface CaptureLeadResult {
  leadId: string;
  partyId: string;
  deduplicated: boolean;
  ownerMemberId?: string;
  routingReason: string;
  possibleMatches: number;
}

const newIdempotencyKey = () => crypto.randomUUID();

/** Leads workspace: lists, record, stage and assignment. */
function leadQueries(apiClient: ApiClient) {
  return {
    // Leads workspace
    async getLeadStats(): Promise<LeadStats> {
      return apiClient.get('/api/v1/leads/stats');
    },

    async listLeads(filter?: {
      stage?: LeadStage[];
      owner?: string | 'me';
      product?: ProductLine;
      source?: LeadSource;
      sla?: 'breached' | 'pending';
      q?: string;
      sort?: 'createdAt' | '-createdAt' | 'slaDueAt';
      limit?: number;
      cursor?: string;
    }): Promise<{ items: LeadListItem[]; nextCursor?: string }> {
      return apiClient.get('/api/v1/leads', {
        query: {
          stage: filter?.stage?.join(','),
          owner: filter?.owner,
          product: filter?.product,
          source: filter?.source,
          sla: filter?.sla,
          q: filter?.q,
          sort: filter?.sort,
          limit: filter?.limit ?? 25,
          cursor: filter?.cursor,
        },
      });
    },

    async createLead(input: {
      fullName: string;
      mobile?: string;
      email?: string;
      productInterest: ProductLine;
      pincode?: string;
      language?: string;
      source: LeadSource;
      campaignId?: string;
      consent: {
        granted: boolean;
        noticeVersion: string;
        channels: Array<'CALL' | 'WHATSAPP'>;
        purposes: Array<'SERVICE' | 'MARKETING'>;
      };
    }): Promise<CaptureLeadResult> {
      return apiClient.post('/api/v1/leads', input, {
        idempotencyKey: newIdempotencyKey(),
      });
    },

    // Lead record
    async getLead(id: string): Promise<LeadDetailView> {
      return apiClient.get(`/api/v1/leads/${id}`);
    },

    async updateLeadQualification(id: string, qualification: Qualification): Promise<LeadDetailView> {
      return apiClient.put(`/api/v1/leads/${id}/qualification`, qualification);
    },

    async transitionLeadStage(
      id: string,
      input: { to: LeadStage; lostReason?: LostReason }
    ): Promise<LeadDetailView> {
      return apiClient.post(
        `/api/v1/leads/${id}/stage-transitions`,
        input,
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async assignLead(id: string, memberId: string): Promise<LeadDetailView> {
      return apiClient.post(
        `/api/v1/leads/${id}/assignments`,
        { memberId },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async bulkAssignLeads(leadIds: string[], memberId: string): Promise<{
      assigned: string[];
      skipped: Array<{ leadId: string; reason: string }>;
    }> {
      return apiClient.post(
        '/api/v1/leads/bulk-assignments',
        { leadIds, memberId },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

  };
}

/** Lead activities, party link and conversion. */
function leadActions(apiClient: ApiClient) {
  return {
    async logLeadActivity(
      leadId: string,
      input: {
        kind: string;
        outcome?: CallOutcome;
        summary?: string;
        occurredAt?: string;
        clientRef?: string;
      }
    ): Promise<Activity> {
      return apiClient.post(
        `/api/v1/leads/${leadId}/activities`,
        input,
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async linkLeadToParty(leadId: string, partyId: string): Promise<LeadDetailView> {
      return apiClient.post(
        `/api/v1/leads/${leadId}/party-link`,
        { partyId },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async convertLead(
      leadId: string,
      input: {
        partyChoice: 'LEAD_PARTY' | { existingPartyId: string };
        productInterest: ProductLine;
        expectedPremiumPaise: number;
        startStage: 'DISCOVERY' | 'QUOTE_SHARED';
      }
    ): Promise<{ opportunityId: string; partyId: string }> {
      return apiClient.post(
        `/api/v1/leads/${leadId}/conversion`,
        input,
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    // Pipeline
  };
}

/** Pipeline and tasks. */
function pipelineAndTasks(apiClient: ApiClient) {
  return {
    async getOpportunitiesBoard(filter?: {
      owner?: string;
      product?: ProductLine;
    }): Promise<BoardResponse> {
      return apiClient.get('/api/v1/opportunities', {
        query: {
          view: 'board',
          owner: filter?.owner,
          product: filter?.product,
        },
      });
    },

    async moveOpportunityStage(
      opportunityId: string,
      to: OpportunityStage
    ): Promise<OpportunityView> {
      return apiClient.post(
        `/api/v1/opportunities/${opportunityId}/stage-transitions`,
        { to },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    async markOpportunityLost(
      opportunityId: string,
      reason: LostReason
    ): Promise<OpportunityView> {
      return apiClient.post(
        `/api/v1/opportunities/${opportunityId}/loss`,
        { reason },
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    // Tasks
    async listTasks(filter?: {
      mine?: boolean;
      bucket?: 'OVERDUE' | 'TODAY' | 'UPCOMING';
      kind?: TaskKind;
      owner?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      groups: Array<{ bucket: string; items: TaskView[] }>;
      counts: { overdue: number; today: number; upcoming: number };
    }> {
      return apiClient.get('/api/v1/tasks', {
        query: {
          mine: filter?.mine ?? true,
          bucket: filter?.bucket,
          kind: filter?.kind,
          owner: filter?.owner,
          limit: filter?.limit ?? 100,
          cursor: filter?.cursor,
        },
      });
    },

    async createTask(input: {
      subjectType: 'LEAD' | 'PARTY' | 'OPPORTUNITY' | 'DUE' | 'PROPOSAL';
      subjectId: string;
      kind: TaskKind;
      title: string;
      dueAt: string;
      ownerMemberId?: string;
    }): Promise<TaskView> {
      return apiClient.post(
        '/api/v1/tasks',
        input,
        { idempotencyKey: newIdempotencyKey() }
      );
    },

    /** Optimistic concurrency: the task's version is sent as If-Match "v<version>" (412 when stale). */
    async updateTask(
      id: string,
      version: number,
      input: {
        status?: 'DONE' | 'CANCELLED';
        outcome?: string;
        dueAt?: string;
        ownerMemberId?: string;
      }
    ): Promise<TaskView> {
      return apiClient.patch(`/api/v1/tasks/${id}`, input, { ifMatch: `"v${version}"` });
    },

    // Routing (CRM07)
  };
}

/** Routing rules, lead import and my-work. */
function routingAndImport(apiClient: ApiClient) {
  return {
    async listRoutingRules(): Promise<{ rules: RoutingRule[] }> {
      return apiClient.get('/api/v1/routing-rules');
    },

    async updateRoutingRules(rules: RoutingRule[]): Promise<{ rules: RoutingRule[] }> {
      return apiClient.put('/api/v1/routing-rules', { rules });
    },

    async simulateRouting(input: {
      productInterest: ProductLine;
      source: LeadSource;
      pincode?: string;
      campaignId?: string;
      language?: string;
      micrositeMemberId?: string;
    }): Promise<RoutingDecision> {
      return apiClient.post('/api/v1/routing-rules/simulations', input);
    },

    async getRoutingCapacity(): Promise<{ items: CapacityRow[] }> {
      return apiClient.get('/api/v1/routing/capacity');
    },

    // Lead Import (CRM08)
    async previewLeadImport(input: {
      fileChecksum: string;
      sourceTag: string;
      consentBasis: 'CAPTURED_AT_EVENT' | 'NONE';
      noticeVersion?: string;
      rows: Array<{
        fullName: string;
        mobile?: string;
        email?: string;
        productInterest?: ProductLine;
        pincode?: string;
      }>;
    }): Promise<{ valid: number; duplicates: number; rejected: RejectedRow[] }> {
      return apiClient.post('/api/v1/lead-imports/previews', input);
    },

    async commitLeadImport(input: {
      fileChecksum: string;
      sourceTag: string;
      consentBasis: 'CAPTURED_AT_EVENT' | 'NONE';
      noticeVersion?: string;
      route?: boolean;
      rows: Array<{
        fullName: string;
        mobile?: string;
        email?: string;
        productInterest?: ProductLine;
        pincode?: string;
      }>;
    }): Promise<LeadImportResult> {
      return apiClient.post('/api/v1/lead-imports', input, { idempotencyKey: newIdempotencyKey() });
    },

    // My work
    async getMyWork(): Promise<{ items: MyWorkItem[]; counts: { overdue: number; today: number; hotLeads: number } }> {
      return apiClient.get('/api/v1/my-work');
    },
  };
}

export function createCrmApi(apiClient: ApiClient) {
  return { ...leadQueries(apiClient), ...leadActions(apiClient), ...pipelineAndTasks(apiClient), ...routingAndImport(apiClient) };
}

export type CrmApi = ReturnType<typeof createCrmApi>;
