import { PreconditionFailedError, RateLimitedError, ValidationError } from '../../../kernel/errors/domain-errors';
import { cursorOffset, encodeCursor } from '../../../kernel/http/pagination';
import { isPgTransaction, PgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { Money } from '../../../kernel/domain';
import { Attribution, Lead, LeadProps } from '../domain/lead';
import { Activity } from '../domain/activity';
import { Task, TaskProps } from '../domain/task';
import { Opportunity, OpportunityProps } from '../domain/opportunity';
import { RoutingRule } from '../domain/routing/routing-rule';
import {
  ActivityRepository, LeadFilter, LeadImportBatch, LeadImportRepository, LeadRepository, LeadStats, OpportunityRepository, PublicLeadGuard,
  RecordScope, RoutingRuleRepository, TaskListFilter, TaskRepository,
} from '../application/ports';
import { CrmSyncStateRepository, SyncObject, SyncState, SyncStatus } from '../application/twenty-sync.ports';

function pg(tx: Transaction): PgTransaction {
  if (!isPgTransaction(tx)) throw new Error('Postgres repository used outside a Postgres transaction');
  return tx;
}

const iso = (d: Date | null): string | undefined => (d ? d.toISOString() : undefined);
const opt = <K extends string, V>(key: K, value: V | null | undefined): { [P in K]?: V } => (value === null || value === undefined ? {} : ({ [key]: value } as { [P in K]?: V }));
const json = (v: unknown): string => JSON.stringify(v);

/** Offset cursor, like the in-memory adapters: fetch limit + 1 rows from `offset`. */
function offsetOf(cursor: string | undefined): number {
  return cursorOffset(cursor);
}
function pageOf<T>(rows: T[], offset: number, limit: number): { items: T[]; nextCursor?: string } {
  return { items: rows.slice(0, limit), ...(rows.length > limit ? { nextCursor: encodeCursor({ offset: offset + limit }) } : {}) };
}

/** Collects positional parameters while a WHERE clause is assembled. */
class Where {
  readonly params: unknown[] = [];
  private readonly parts: string[] = [];

  add(sql: (ph: (value: unknown) => string) => string): void {
    this.parts.push(sql((value) => { this.params.push(value); return `$${this.params.length}`; }));
  }

  get clause(): string {
    return this.parts.length ? `where ${this.parts.join(' and ')}` : '';
  }

  /** M02 record scopes: OWN → owner, UNIT_SUBTREE → owner's unit, TENANT → all. */
  scope(scope: RecordScope): void {
    if (scope.kind === 'TENANT') return;
    if (scope.kind === 'UNIT_SUBTREE') this.add((ph) => `org_unit_id = any(${ph(scope.orgUnitIds ?? [])}::text[])`);
    else if (scope.memberId) this.add((ph) => `owner_member_id = ${ph(scope.memberId)}`);
    else this.add(() => 'false');
  }
}

const OPEN_LEAD = `stage not in ('CONVERTED','LOST')`;

interface LeadRow {
  id: string; party_id: string; product_interest: LeadProps['productInterest']; pincode: string | null; language: string | null; stage: LeadProps['stage']; temperature: LeadProps['temperature'];
  owner_member_id: string | null; org_unit_id: string | null; routed_by_rule_id: string | null; attribution: Attribution; qualification: LeadProps['qualification']; lost_reason: LeadProps['lostReason'] | null;
  sla_due_at: Date | null; first_responded_at: Date | null; sla_breach_notified_at: Date | null; stage_history: LeadProps['stageHistory']; converted_opportunity_id: string | null;
  sync_state: LeadProps['syncState']; external_ref: string | null; created_at: Date; updated_at: Date; version: number; custom_fields: LeadProps['customFields'];
}

const toLead = (r: LeadRow): Lead => Lead.restore({
  id: r.id, partyId: r.party_id, productInterest: r.product_interest, ...opt('pincode', r.pincode), ...opt('language', r.language), stage: r.stage, temperature: r.temperature,
  ...opt('ownerMemberId', r.owner_member_id), ...opt('orgUnitId', r.org_unit_id), ...opt('routedByRuleId', r.routed_by_rule_id), attribution: r.attribution, qualification: r.qualification,
  ...opt('lostReason', r.lost_reason), ...opt('slaDueAt', iso(r.sla_due_at)), ...opt('firstRespondedAt', iso(r.first_responded_at)), ...opt('slaBreachNotifiedAt', iso(r.sla_breach_notified_at)),
  stageHistory: r.stage_history, ...opt('convertedOpportunityId', r.converted_opportunity_id), syncState: r.sync_state, ...opt('externalRef', r.external_ref),
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(), version: r.version, customFields: r.custom_fields ?? {},
});

const nul = <T>(v: T | undefined): T | null => v ?? null;

function leadParams(tenantId: string, p: Readonly<LeadProps>): unknown[] {
  return [p.id, tenantId, p.partyId, p.productInterest, nul(p.pincode), nul(p.language), p.stage, p.temperature, nul(p.ownerMemberId), nul(p.orgUnitId), nul(p.routedByRuleId),
    json(p.attribution), json(p.qualification), nul(p.lostReason), nul(p.slaDueAt), nul(p.firstRespondedAt), nul(p.slaBreachNotifiedAt), json(p.stageHistory),
    nul(p.convertedOpportunityId), p.syncState, nul(p.externalRef), p.createdAt, p.updatedAt, p.version + 1, json(p.customFields)];
}

const LEAD_SORT: Record<NonNullable<LeadFilter['sort']>, string> = {
  createdAt: 'created_at, id',
  '-createdAt': 'created_at desc, id desc',
  slaDueAt: 'sla_due_at nulls last, id',
};

const SLA_FILTER = {
  breached: (at: string) => `sla_due_at is not null and ((first_responded_at is not null and first_responded_at > sla_due_at) or (first_responded_at is null and ${at} > sla_due_at))`,
  pending: (at: string) => `sla_due_at is not null and first_responded_at is null and ${at} <= sla_due_at`,
};

export class PgLeadRepository implements LeadRepository {
  async get(tx: Transaction, id: string): Promise<Lead | undefined> {
    const { rows } = await pg(tx).query<LeadRow>('select * from crm_lead where id = $1', [id]);
    return rows[0] && toLead(rows[0]);
  }

  /** Optimistic version like the in-memory adapter. assigned_at tracks the moment the owner last changed (exact "assigned today"). */
  async save(tx: Transaction, lead: Lead): Promise<void> {
    const p = lead.props;
    const { rowCount } = await pg(tx).query(
      `insert into crm_lead (id, tenant_id, party_id, product_interest, pincode, language, stage, temperature, owner_member_id, org_unit_id, routed_by_rule_id, attribution, qualification, lost_reason,
         sla_due_at, first_responded_at, sla_breach_notified_at, stage_history, converted_opportunity_id, sync_state, external_ref, created_at, updated_at, version, custom_fields, assigned_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$23,$24,$25::jsonb, case when $9::text is null then null else $23::timestamptz end)
       on conflict (id) do update set party_id = excluded.party_id, product_interest = excluded.product_interest, pincode = excluded.pincode, language = excluded.language, stage = excluded.stage,
         temperature = excluded.temperature, owner_member_id = excluded.owner_member_id, org_unit_id = excluded.org_unit_id, routed_by_rule_id = excluded.routed_by_rule_id,
         attribution = excluded.attribution, qualification = excluded.qualification, lost_reason = excluded.lost_reason, sla_due_at = excluded.sla_due_at, first_responded_at = excluded.first_responded_at,
         sla_breach_notified_at = excluded.sla_breach_notified_at, stage_history = excluded.stage_history, converted_opportunity_id = excluded.converted_opportunity_id,
         updated_at = excluded.updated_at, version = excluded.version, custom_fields = excluded.custom_fields,
         assigned_at = case when excluded.owner_member_id is not distinct from crm_lead.owner_member_id then crm_lead.assigned_at
                            when excluded.owner_member_id is null then null else excluded.updated_at end
       where crm_lead.version = excluded.version - 1`,
      leadParams(tx.tenantId, p));
    if (rowCount === 0) throw new PreconditionFailedError('version_mismatch', 'The lead was changed by someone else; reload and retry');
    lead.markSaved();
  }

  async findOpenByParties(tx: Transaction, partyIds: readonly string[], since: Date): Promise<Lead | undefined> {
    const { rows } = await pg(tx).query<LeadRow>(
      `select * from crm_lead where party_id = any($1::text[]) and ${OPEN_LEAD} and created_at >= $2 order by created_at desc, id desc limit 1`, [[...partyIds], since]);
    return rows[0] && toLead(rows[0]);
  }

  async list(tx: Transaction, f: LeadFilter): Promise<{ items: Lead[]; nextCursor?: string }> {
    const w = new Where();
    w.scope(f.scope);
    if (f.stage?.length) w.add((ph) => `stage = any(${ph(f.stage)}::text[])`);
    if (f.ownerMemberId === 'unassigned') w.add(() => 'owner_member_id is null');
    else if (f.ownerMemberId) w.add((ph) => `owner_member_id = ${ph(f.ownerMemberId)}`);
    if (f.productInterest) w.add((ph) => `product_interest = ${ph(f.productInterest)}`);
    if (f.source) w.add((ph) => `attribution->>'source' = ${ph(f.source)}`);
    if (f.slaState) w.add((ph) => SLA_FILTER[f.slaState as 'breached' | 'pending'](ph(f.at)));
    const offset = offsetOf(f.cursor);
    const { rows } = await pg(tx).query<LeadRow>(
      `select * from crm_lead ${w.clause} order by ${LEAD_SORT[f.sort ?? '-createdAt']} limit ${Number(f.limit) + 1} offset ${offset}`, w.params);
    return pageOf(rows.map(toLead), offset, f.limit);
  }

  /** Exact: counts open leads whose owner was set today (crm_lead.assigned_at); the in-memory adapter approximates with updatedAt. */
  async countOpenToday(tx: Transaction, memberIds: readonly string[], dayStart: Date): Promise<Record<string, number>> {
    const { rows } = await pg(tx).query<{ owner_member_id: string; n: string }>(
      `select owner_member_id, count(*) as n from crm_lead where owner_member_id = any($1::text[]) and ${OPEN_LEAD} and assigned_at >= $2 group by owner_member_id`, [[...memberIds], dayStart]);
    return Object.fromEntries(rows.map((r) => [r.owner_member_id, Number(r.n)]));
  }

  async stats(tx: Transaction, scope: RecordScope, now: Date): Promise<LeadStats> {
    const w = new Where();
    w.scope(scope);
    const nowPh = `$${w.params.push(now)}`;
    const weekPh = `$${w.params.push(new Date(now.getTime() - 7 * 86_400_000))}`;
    const settled = `(created_at >= ${weekPh} and sla_due_at is not null and (first_responded_at is not null or ${nowPh} > sla_due_at))`;
    const { rows } = await pg(tx).query<{ open: string; unassigned: string; settled: string; met: string }>(
      `select count(*) filter (where ${OPEN_LEAD}) as open, count(*) filter (where ${OPEN_LEAD} and owner_member_id is null) as unassigned,
         count(*) filter (where ${settled}) as settled, count(*) filter (where ${settled} and first_responded_at is not null and first_responded_at <= sla_due_at) as met
       from crm_lead ${w.clause}`, w.params);
    const r = rows[0];
    const settledN = Number(r.settled);
    return {
      open: Number(r.open),
      unassigned: Number(r.unassigned),
      slaMetPct7d: settledN ? Math.round((Number(r.met) / settledN) * 100) : null,
      leadToIssuedPct90d: null, // needs insurer-confirmed issuance (M07/M09); never estimated
    };
  }

  async openForOwner(tx: Transaction, memberId: string): Promise<Lead[]> {
    const { rows } = await pg(tx).query<LeadRow>(`select * from crm_lead where owner_member_id = $1 and ${OPEN_LEAD} order by created_at, id`, [memberId]);
    return rows.map(toLead);
  }

  async forParty(tx: Transaction, partyId: string): Promise<Lead[]> {
    const { rows } = await pg(tx).query<LeadRow>('select * from crm_lead where party_id = $1 order by created_at, id', [partyId]);
    return rows.map(toLead);
  }

  async slaBreachCandidates(tx: Transaction, now: Date, limit: number): Promise<Lead[]> {
    const { rows } = await pg(tx).query<LeadRow>(
      `select * from crm_lead where first_responded_at is null and sla_due_at < $1 and stage in ('NEW','CONTACTED') order by sla_due_at, id limit $2`, [now, limit]);
    return rows.map(toLead);
  }
}

interface ActivityRow {
  id: string; subject_type: Activity['subjectType']; subject_id: string; kind: Activity['kind']; outcome: Activity['outcome'] | null; summary: string | null;
  occurred_at: Date; actor_member_id: string | null; client_ref: string | null;
}

const toActivity = (r: ActivityRow): Activity => ({
  id: r.id, subjectType: r.subject_type, subjectId: r.subject_id, kind: r.kind, ...opt('outcome', r.outcome), ...opt('summary', r.summary),
  occurredAt: r.occurred_at.toISOString(), ...opt('actorMemberId', r.actor_member_id), ...opt('clientRef', r.client_ref),
});

/** Append-only: the app role holds no UPDATE/DELETE on crm_activity. */
export class PgActivityRepository implements ActivityRepository {
  async add(tx: Transaction, a: Activity): Promise<{ duplicate: boolean; activity: Activity }> {
    const q = pg(tx);
    const inserted = await q.query<ActivityRow>(
      `insert into crm_activity (id, tenant_id, subject_type, subject_id, kind, outcome, summary, occurred_at, actor_member_id, client_ref)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (tenant_id, client_ref) do nothing returning *`,
      [a.id, tx.tenantId, a.subjectType, a.subjectId, a.kind, a.outcome ?? null, a.summary ?? null, a.occurredAt, a.actorMemberId ?? null, a.clientRef ?? null]);
    if (inserted.rows[0]) return { duplicate: false, activity: toActivity(inserted.rows[0]) };
    const { rows } = await q.query<ActivityRow>('select * from crm_activity where client_ref = $1', [a.clientRef]);
    return { duplicate: true, activity: toActivity(rows[0]) };
  }

  async forSubject(tx: Transaction, type: Activity['subjectType'], id: string, limit: number): Promise<Activity[]> {
    const { rows } = await pg(tx).query<ActivityRow>(
      'select * from crm_activity where subject_type = $1 and subject_id = $2 order by occurred_at desc, id desc limit $3', [type, id, limit]);
    return rows.map(toActivity);
  }

  async countCallAttempts(tx: Transaction, leadId: string): Promise<number> {
    const { rows } = await pg(tx).query<{ n: string }>(`select count(*) as n from crm_activity where subject_type = 'LEAD' and subject_id = $1 and kind = 'CALL'`, [leadId]);
    return Number(rows[0].n);
  }
}

interface TaskRow {
  id: string; owner_member_id: string; subject_type: TaskProps['subjectType']; subject_id: string; kind: TaskProps['kind']; title: string; due_at: Date; status: TaskProps['status'];
  outcome: string | null; source: TaskProps['source']; escalated_at: Date | null; created_at: Date; completed_at: Date | null; version: number;
}

const toTask = (r: TaskRow): Task => Task.restore({
  id: r.id, ownerMemberId: r.owner_member_id, subjectType: r.subject_type, subjectId: r.subject_id, kind: r.kind, title: r.title, dueAt: r.due_at.toISOString(), status: r.status,
  ...opt('outcome', r.outcome), source: r.source, ...opt('escalatedAt', iso(r.escalated_at)), createdAt: r.created_at.toISOString(), ...opt('completedAt', iso(r.completed_at)), version: r.version,
});

export class PgTaskRepository implements TaskRepository {
  async get(tx: Transaction, id: string): Promise<Task | undefined> {
    const { rows } = await pg(tx).query<TaskRow>('select * from crm_task where id = $1', [id]);
    return rows[0] && toTask(rows[0]);
  }

  async save(tx: Transaction, t: Task): Promise<void> {
    const p = t.props;
    const { rowCount } = await pg(tx).query(
      `insert into crm_task (id, tenant_id, owner_member_id, subject_type, subject_id, kind, title, due_at, status, outcome, source, escalated_at, created_at, completed_at, version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do update set owner_member_id = excluded.owner_member_id, subject_type = excluded.subject_type, subject_id = excluded.subject_id, kind = excluded.kind, title = excluded.title,
         due_at = excluded.due_at, status = excluded.status, outcome = excluded.outcome, source = excluded.source, escalated_at = excluded.escalated_at, completed_at = excluded.completed_at,
         version = excluded.version
       where crm_task.version = excluded.version - 1`,
      [p.id, tx.tenantId, p.ownerMemberId, p.subjectType, p.subjectId, p.kind, p.title, p.dueAt, p.status, p.outcome ?? null, p.source, p.escalatedAt ?? null, p.createdAt, p.completedAt ?? null, p.version + 1]);
    if (rowCount === 0) throw new PreconditionFailedError('version_mismatch', 'The task was changed by someone else; reload and retry');
    t.markSaved();
  }

  async list(tx: Transaction, f: TaskListFilter): Promise<{ items: Task[]; nextCursor?: string }> {
    const w = new Where();
    if (f.ownerMemberIds) w.add((ph) => `owner_member_id = any(${ph([...(f.ownerMemberIds ?? [])])}::text[])`);
    if (f.status) w.add((ph) => `status = ${ph(f.status)}`);
    if (f.kind) w.add((ph) => `kind = ${ph(f.kind)}`);
    const offset = offsetOf(f.cursor);
    const { rows } = await pg(tx).query<TaskRow>(`select * from crm_task ${w.clause} order by due_at, id limit ${Number(f.limit) + 1} offset ${offset}`, w.params);
    return pageOf(rows.map(toTask), offset, f.limit);
  }

  async openForSubject(tx: Transaction, type: TaskProps['subjectType'], id: string): Promise<Task[]> {
    const { rows } = await pg(tx).query<TaskRow>(`select * from crm_task where subject_type = $1 and subject_id = $2 and status = 'OPEN' order by due_at, id`, [type, id]);
    return rows.map(toTask);
  }

  async openForOwner(tx: Transaction, memberId: string): Promise<Task[]> {
    const { rows } = await pg(tx).query<TaskRow>(`select * from crm_task where owner_member_id = $1 and status = 'OPEN' order by due_at, id`, [memberId]);
    return rows.map(toTask);
  }

  async escalationCandidates(tx: Transaction, now: Date, limit: number): Promise<Task[]> {
    const { rows } = await pg(tx).query<TaskRow>(
      `select * from crm_task where status = 'OPEN' and escalated_at is null and due_at + interval '24 hours' < $1 order by due_at, id limit $2`, [now, limit]);
    return rows.map(toTask);
  }
}

interface OpportunityRow {
  id: string; party_id: string; lead_id: string | null; product_interest: OpportunityProps['productInterest']; title: string; expected_premium_paise: string; currency: string;
  stage: OpportunityProps['stage']; owner_member_id: string; org_unit_id: string | null; attribution: Attribution | null; insurer_name: string | null; lost_reason: OpportunityProps['lostReason'] | null;
  issued_policy_sale_id: string | null; stage_entered_at: Date; created_at: Date; version: number; custom_fields: OpportunityProps['customFields'];
}

const toOpportunity = (r: OpportunityRow): Opportunity => Opportunity.restore({
  id: r.id, partyId: r.party_id, ...opt('leadId', r.lead_id), productInterest: r.product_interest, title: r.title, expectedPremium: Money.ofPaise(Number(r.expected_premium_paise)),
  stage: r.stage, ownerMemberId: r.owner_member_id, ...opt('orgUnitId', r.org_unit_id), ...opt('attribution', r.attribution), ...opt('insurerName', r.insurer_name), ...opt('lostReason', r.lost_reason),
  ...opt('issuedPolicySaleId', r.issued_policy_sale_id), stageEnteredAt: r.stage_entered_at.toISOString(), createdAt: r.created_at.toISOString(), version: r.version, customFields: r.custom_fields ?? {},
});

export class PgOpportunityRepository implements OpportunityRepository {
  async get(tx: Transaction, id: string): Promise<Opportunity | undefined> {
    const { rows } = await pg(tx).query<OpportunityRow>('select * from crm_opportunity where id = $1', [id]);
    return rows[0] && toOpportunity(rows[0]);
  }

  async save(tx: Transaction, o: Opportunity): Promise<void> {
    const p = o.props;
    const { rowCount } = await pg(tx).query(
      `insert into crm_opportunity (id, tenant_id, party_id, lead_id, product_interest, title, expected_premium_paise, currency, stage, owner_member_id, org_unit_id, attribution, insurer_name, lost_reason,
         issued_policy_sale_id, stage_entered_at, created_at, version, custom_fields)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19::jsonb)
       on conflict (id) do update set party_id = excluded.party_id, lead_id = excluded.lead_id, product_interest = excluded.product_interest, title = excluded.title,
         expected_premium_paise = excluded.expected_premium_paise, currency = excluded.currency, stage = excluded.stage, owner_member_id = excluded.owner_member_id, org_unit_id = excluded.org_unit_id,
         attribution = excluded.attribution, insurer_name = excluded.insurer_name, lost_reason = excluded.lost_reason, issued_policy_sale_id = excluded.issued_policy_sale_id,
         stage_entered_at = excluded.stage_entered_at, version = excluded.version, custom_fields = excluded.custom_fields
       where crm_opportunity.version = excluded.version - 1`,
      [p.id, tx.tenantId, p.partyId, p.leadId ?? null, p.productInterest, p.title, p.expectedPremium.paise, p.expectedPremium.currency, p.stage, p.ownerMemberId, p.orgUnitId ?? null,
        p.attribution ? json(p.attribution) : null, p.insurerName ?? null, p.lostReason ?? null, p.issuedPolicySaleId ?? null, p.stageEnteredAt, p.createdAt, p.version + 1, json(p.customFields)]);
    if (rowCount === 0) throw new PreconditionFailedError('version_mismatch', 'The opportunity was changed by someone else; reload and retry');
    o.markSaved();
  }

  async board(tx: Transaction, f: { scope: RecordScope; ownerMemberId?: string; productInterest?: string }): Promise<Opportunity[]> {
    const w = new Where();
    w.scope(f.scope);
    if (f.ownerMemberId) w.add((ph) => `owner_member_id = ${ph(f.ownerMemberId)}`);
    if (f.productInterest) w.add((ph) => `product_interest = ${ph(f.productInterest)}`);
    const { rows } = await pg(tx).query<OpportunityRow>(`select * from crm_opportunity ${w.clause} order by stage_entered_at, id`, w.params);
    return rows.map(toOpportunity);
  }

  async findByProposal(tx: Transaction, proposalId: string): Promise<Opportunity | undefined> {
    const { rows } = await pg(tx).query<OpportunityRow>('select * from crm_opportunity where core_proposal_id = $1', [proposalId]);
    return rows[0] && toOpportunity(rows[0]);
  }

  async openForOwner(tx: Transaction, memberId: string): Promise<Opportunity[]> {
    const { rows } = await pg(tx).query<OpportunityRow>(`select * from crm_opportunity where owner_member_id = $1 and stage not in ('ISSUED','LOST') order by created_at, id`, [memberId]);
    return rows.map(toOpportunity);
  }

  async forParty(tx: Transaction, partyId: string): Promise<Opportunity[]> {
    const { rows } = await pg(tx).query<OpportunityRow>('select * from crm_opportunity where party_id = $1 order by created_at, id', [partyId]);
    return rows.map(toOpportunity);
  }
}

export class PgRoutingRuleRepository implements RoutingRuleRepository {
  async list(tx: Transaction): Promise<RoutingRule[]> {
    const { rows } = await pg(tx).query<{ body: RoutingRule }>('select body from crm_routing_rule order by priority');
    return rows.map((r) => r.body);
  }

  /** Rules are replaced as a set (delete + insert in the caller's transaction). */
  async replaceAll(tx: Transaction, rules: RoutingRule[]): Promise<void> {
    const q = pg(tx);
    await q.query('delete from crm_routing_rule');
    for (const r of rules) await q.query('insert into crm_routing_rule (tenant_id, id, priority, body) values ($1, $2, $3, $4::jsonb)', [tx.tenantId, r.id, r.priority, json(r)]);
  }

  async cursor(tx: Transaction, ruleId: string): Promise<string | undefined> {
    const { rows } = await pg(tx).query<{ last_member_id: string | null }>('select last_member_id from crm_routing_cursor where rule_id = $1', [ruleId]);
    return rows[0]?.last_member_id ?? undefined;
  }

  async setCursor(tx: Transaction, ruleId: string, memberId: string): Promise<void> {
    await pg(tx).query(
      `insert into crm_routing_cursor (tenant_id, rule_id, last_member_id) values ($1, $2, $3) on conflict (tenant_id, rule_id) do update set last_member_id = excluded.last_member_id`,
      [tx.tenantId, ruleId, memberId]);
  }
}

export class PgLeadImportRepository implements LeadImportRepository {
  async findBatchByChecksum(tx: Transaction, checksum: string): Promise<LeadImportBatch | undefined> {
    const { rows } = await pg(tx).query<{ id: string; file_checksum: string; source_tag: string; summary: LeadImportBatch['summary']; created_at: Date }>(
      'select id, file_checksum, source_tag, summary, created_at from crm_lead_import where file_checksum = $1', [checksum]);
    const r = rows[0];
    return r && { id: r.id, fileChecksum: r.file_checksum, sourceTag: r.source_tag, summary: r.summary, createdAt: r.created_at.toISOString() };
  }

  async saveBatch(tx: Transaction, b: LeadImportBatch): Promise<void> {
    await pg(tx).query(
      `insert into crm_lead_import (id, tenant_id, file_checksum, source_tag, summary, created_at) values ($1,$2,$3,$4,$5::jsonb,$6)
       on conflict (id) do update set file_checksum = excluded.file_checksum, source_tag = excluded.source_tag, summary = excluded.summary`,
      [b.id, tx.tenantId, b.fileChecksum, b.sourceTag, json(b.summary), b.createdAt]);
  }

  async rowSeen(tx: Transaction, rowHash: string): Promise<boolean> {
    const { rowCount } = await pg(tx).query('select 1 from crm_lead_import_row where row_hash = $1', [rowHash]);
    return rowCount > 0;
  }

  async markRow(tx: Transaction, rowHash: string, batchId: string): Promise<void> {
    await pg(tx).query('insert into crm_lead_import_row (tenant_id, row_hash, batch_id) values ($1, $2, $3) on conflict (tenant_id, row_hash) do nothing', [tx.tenantId, rowHash, batchId]);
  }
}

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 10;

/** Honeypot + rolling window: one crm_public_lead_rate row per accepted hit (window_start = the hit's time), so the window is exact. */
export class PgPublicLeadGuard implements PublicLeadGuard {
  async check(tx: Transaction, input: { ipHash: string; honeypot?: string; at: Date }): Promise<void> {
    if (input.honeypot) throw new ValidationError('spam_detected', 'Submission rejected');
    const q = pg(tx);
    await q.query('select pg_advisory_xact_lock(hashtext($1))', [`${tx.tenantId}:public-lead:${input.ipHash}`]);
    const windowStart = new Date(input.at.getTime() - WINDOW_MS);
    await q.query('delete from crm_public_lead_rate where window_start <= $1', [windowStart]); // expired hits, all addresses in this tenant
    const { rows } = await q.query<{ n: string }>(
      'select coalesce(sum(count), 0) as n from crm_public_lead_rate where ip_hash = $1 and window_start > $2', [input.ipHash, windowStart]);
    if (Number(rows[0].n) >= MAX_PER_WINDOW) throw new RateLimitedError('public_lead_rate_limited', 'Too many submissions; try again later', { retryAfterSeconds: 600 });
    await q.query(
      `insert into crm_public_lead_rate (tenant_id, ip_hash, window_start, count) values ($1, $2, $3, 1)
       on conflict (tenant_id, ip_hash, window_start) do update set count = crm_public_lead_rate.count + 1`, [tx.tenantId, input.ipHash, input.at]);
  }
}

/** Sync bookkeeping in its own table: never touches an aggregate row, so versions (and users' If-Match) are untouched. */
export class PgCrmSyncStateRepository implements CrmSyncStateRepository {
  async get(tx: Transaction, object: SyncObject, id: string): Promise<SyncStatus | undefined> {
    const { rows } = await pg(tx).query<{ state: SyncState; external_ref: string | null; attempts: number; last_error: string | null; updated_at: Date }>(
      'select state, external_ref, attempts, last_error, updated_at from crm_sync_state where object = $1 and id = $2', [object, id]);
    const r = rows[0];
    return r && { state: r.state, ...opt('externalRef', r.external_ref), attempts: r.attempts, ...opt('lastError', r.last_error), updatedAt: r.updated_at.toISOString() };
  }

  async set(tx: Transaction, object: SyncObject, id: string, s: SyncStatus): Promise<void> {
    await pg(tx).query(
      `insert into crm_sync_state (tenant_id, object, id, state, external_ref, attempts, last_error, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (tenant_id, object, id) do update set state = excluded.state, external_ref = excluded.external_ref, attempts = excluded.attempts, last_error = excluded.last_error, updated_at = excluded.updated_at`,
      [tx.tenantId, object, id, s.state, s.externalRef ?? null, s.attempts, s.lastError ?? null, s.updatedAt]);
  }
}
