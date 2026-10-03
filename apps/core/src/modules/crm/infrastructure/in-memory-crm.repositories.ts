import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { TenantBuckets } from '../../../kernel/persistence/tenant-buckets';
import { PreconditionFailedError, RateLimitedError, ValidationError } from '../../../kernel/errors/domain-errors';
import { cursorOffset, encodeCursor } from '../../../kernel/http/pagination';
import { Lead, LeadProps } from '../domain/lead';
import { Activity } from '../domain/activity';
import { Task, TaskProps } from '../domain/task';
import { Opportunity, OpportunityProps } from '../domain/opportunity';
import { RoutingRule } from '../domain/routing/routing-rule';
import {
  ActivityRepository, LeadFilter, LeadImportBatch, LeadImportRepository, LeadRepository, LeadStats, OpportunityRepository, PublicLeadGuard,
  RecordScope, RoutingRuleRepository, TaskListFilter, TaskRepository,
} from '../application/ports';
import { inScope } from '../application/crm-scope';

const CLOSED = new Set(['CONVERTED', 'LOST']);
const DAY_MS = 86_400_000;

function page<T>(all: T[], cursor: string | undefined, limit: number): { items: T[]; nextCursor?: string } {
  const start = cursorOffset(cursor);
  return { items: all.slice(start, start + limit), nextCursor: start + limit < all.length ? encodeCursor({ offset: start + limit }) : undefined };
}

const cloneLead = (p: LeadProps): LeadProps => structuredClone(p);

/** Optimistic save shared by the aggregate stores: stored version must equal the aggregate's. */
function saveVersioned<P extends { id: string; version: number }>(bucket: Map<string, P>, props: P, entity: string, clone: (p: P) => P): void {
  const stored = bucket.get(props.id);
  if (stored && stored.version !== props.version) throw new PreconditionFailedError('version_mismatch', `The ${entity} was changed by someone else; reload and retry`);
  bucket.set(props.id, clone({ ...props, version: props.version + 1 }));
}

export class InMemoryLeadRepository implements LeadRepository {
  private readonly leads = new TenantBuckets<Map<string, LeadProps>>(() => new Map());

  async get(tx: Transaction, id: string): Promise<Lead | undefined> {
    const p = this.leads.of(tx).get(id);
    return p && Lead.restore(cloneLead(p));
  }

  async save(tx: Transaction, lead: Lead): Promise<void> {
    saveVersioned(this.leads.of(tx), lead.props as LeadProps, 'lead', cloneLead);
    lead.markSaved();
  }

  async findOpenByParties(tx: Transaction, partyIds: readonly string[], since: Date): Promise<Lead | undefined> {
    const hit = this.all(tx)
      .filter((p) => partyIds.includes(p.partyId) && !CLOSED.has(p.stage) && Date.parse(p.createdAt) >= since.getTime())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return hit && Lead.restore(cloneLead(hit));
  }

  async list(tx: Transaction, f: LeadFilter): Promise<{ items: Lead[]; nextCursor?: string }> {
    const items = this.all(tx)
      .map((p) => Lead.restore(cloneLead(p)))
      .filter((l) => inScope(l.props, f.scope) && matches(l, f))
      .sort(sorter(f.sort));
    return page(items, f.cursor, f.limit);
  }

  async countOpenToday(tx: Transaction, memberIds: readonly string[], dayStart: Date): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const p of this.all(tx)) {
      if (p.ownerMemberId && memberIds.includes(p.ownerMemberId) && !CLOSED.has(p.stage) && Date.parse(p.updatedAt) >= dayStart.getTime()) {
        counts[p.ownerMemberId] = (counts[p.ownerMemberId] ?? 0) + 1;
      }
    }
    return counts;
  }

  async stats(tx: Transaction, scope: RecordScope, now: Date): Promise<LeadStats> {
    const leads = this.all(tx).map((p) => Lead.restore(cloneLead(p))).filter((l) => inScope(l.props, scope));
    const open = leads.filter((l) => !CLOSED.has(l.props.stage));
    const recent = leads.filter((l) => Date.parse(l.props.createdAt) >= now.getTime() - 7 * DAY_MS && ['met', 'breached'].includes(l.slaState(now)));
    return {
      open: open.length,
      unassigned: open.filter((l) => !l.props.ownerMemberId).length,
      slaMetPct7d: recent.length ? Math.round((recent.filter((l) => l.slaState(now) === 'met').length / recent.length) * 100) : null,
      leadToIssuedPct90d: null, // needs insurer-confirmed issuance (M07/M09); never estimated
    };
  }

  async openForOwner(tx: Transaction, memberId: string): Promise<Lead[]> {
    return this.all(tx).filter((p) => p.ownerMemberId === memberId && !CLOSED.has(p.stage)).map((p) => Lead.restore(cloneLead(p)));
  }

  async forParty(tx: Transaction, partyId: string): Promise<Lead[]> {
    return this.all(tx).filter((p) => p.partyId === partyId).map((p) => Lead.restore(cloneLead(p)));
  }

  async slaBreachCandidates(tx: Transaction, now: Date, limit: number): Promise<Lead[]> {
    return this.all(tx)
      .filter((p) => !p.firstRespondedAt && p.slaDueAt && Date.parse(p.slaDueAt) < now.getTime() && ['NEW', 'CONTACTED'].includes(p.stage))
      .slice(0, limit)
      .map((p) => Lead.restore(cloneLead(p)));
  }

  private all(tx: Transaction): LeadProps[] {
    return [...this.leads.of(tx).values()];
  }
}

const LEAD_FILTERS: Array<(l: Lead, f: LeadFilter) => boolean> = [
  (l, f) => !f.stage?.length || f.stage.includes(l.props.stage),
  (l, f) => (f.ownerMemberId === 'unassigned' ? !l.props.ownerMemberId : !f.ownerMemberId || l.props.ownerMemberId === f.ownerMemberId),
  (l, f) => !f.productInterest || l.props.productInterest === f.productInterest,
  (l, f) => !f.source || l.props.attribution.source === f.source,
  (l, f) => !f.slaState || l.slaState(f.at) === f.slaState,
];

function matches(l: Lead, f: LeadFilter): boolean {
  return LEAD_FILTERS.every((keep) => keep(l, f));
}

function sorter(sort: LeadFilter['sort']) {
  if (sort === 'slaDueAt') return (a: Lead, b: Lead) => (a.props.slaDueAt ?? '9999').localeCompare(b.props.slaDueAt ?? '9999');
  if (sort === 'createdAt') return (a: Lead, b: Lead) => a.props.createdAt.localeCompare(b.props.createdAt) || a.props.id.localeCompare(b.props.id);
  return (a: Lead, b: Lead) => b.props.createdAt.localeCompare(a.props.createdAt) || b.props.id.localeCompare(a.props.id);
}

export class InMemoryActivityRepository implements ActivityRepository {
  private readonly items = new TenantBuckets<Activity[]>(() => []);

  async add(tx: Transaction, a: Activity): Promise<{ duplicate: boolean; activity: Activity }> {
    const list = this.items.of(tx);
    const existing = a.clientRef ? list.find((x) => x.clientRef === a.clientRef) : undefined;
    if (existing) return { duplicate: true, activity: { ...existing } };
    list.push({ ...a });
    return { duplicate: false, activity: { ...a } };
  }

  async forSubject(tx: Transaction, type: Activity['subjectType'], id: string, limit: number): Promise<Activity[]> {
    return this.items.of(tx).filter((a) => a.subjectType === type && a.subjectId === id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit).map((a) => ({ ...a }));
  }

  async countCallAttempts(tx: Transaction, leadId: string): Promise<number> {
    return this.items.of(tx).filter((a) => a.subjectType === 'LEAD' && a.subjectId === leadId && a.kind === 'CALL').length;
  }
}

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new TenantBuckets<Map<string, TaskProps>>(() => new Map());

  async get(tx: Transaction, id: string): Promise<Task | undefined> {
    const p = this.tasks.of(tx).get(id);
    return p && Task.restore({ ...p });
  }

  async save(tx: Transaction, t: Task): Promise<void> {
    saveVersioned(this.tasks.of(tx), t.props as TaskProps, 'task', (p) => ({ ...p }));
    t.markSaved();
  }

  async list(tx: Transaction, f: TaskListFilter): Promise<{ items: Task[]; nextCursor?: string }> {
    const items = this.all(tx)
      .filter((p) => (!f.ownerMemberIds || f.ownerMemberIds.includes(p.ownerMemberId)) && (!f.status || p.status === f.status) && (!f.kind || p.kind === f.kind))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id))
      .map((p) => Task.restore({ ...p }));
    return page(items, f.cursor, f.limit);
  }

  async openForSubject(tx: Transaction, type: TaskProps['subjectType'], id: string): Promise<Task[]> {
    return this.all(tx).filter((p) => p.subjectType === type && p.subjectId === id && p.status === 'OPEN').map((p) => Task.restore({ ...p }));
  }

  async openForOwner(tx: Transaction, memberId: string): Promise<Task[]> {
    return this.all(tx).filter((p) => p.ownerMemberId === memberId && p.status === 'OPEN').map((p) => Task.restore({ ...p }));
  }

  async escalationCandidates(tx: Transaction, now: Date, limit: number): Promise<Task[]> {
    return this.all(tx)
      .filter((p) => p.status === 'OPEN' && !p.escalatedAt && Date.parse(p.dueAt) + DAY_MS < now.getTime())
      .slice(0, limit)
      .map((p) => Task.restore({ ...p }));
  }

  private all(tx: Transaction): TaskProps[] {
    return [...this.tasks.of(tx).values()];
  }
}

export class InMemoryOpportunityRepository implements OpportunityRepository {
  private readonly items = new TenantBuckets<Map<string, OpportunityProps>>(() => new Map());

  async get(tx: Transaction, id: string): Promise<Opportunity | undefined> {
    const p = this.items.of(tx).get(id);
    return p && Opportunity.restore({ ...p });
  }

  async save(tx: Transaction, o: Opportunity): Promise<void> {
    saveVersioned(this.items.of(tx), o.props as OpportunityProps, 'opportunity', (p) => ({ ...p }));
    o.markSaved();
  }

  async board(tx: Transaction, f: { scope: RecordScope; ownerMemberId?: string; productInterest?: string }): Promise<Opportunity[]> {
    return this.all(tx)
      .filter((p) => inScope(p, f.scope) && (!f.ownerMemberId || p.ownerMemberId === f.ownerMemberId) && (!f.productInterest || p.productInterest === f.productInterest))
      .sort((a, b) => a.stageEnteredAt.localeCompare(b.stageEnteredAt))
      .map((p) => Opportunity.restore({ ...p }));
  }

  async findByProposal(): Promise<Opportunity | undefined> {
    return undefined; // proposals (M09) link opportunities by id until the proposal module stores core_proposal_id
  }

  async openForOwner(tx: Transaction, memberId: string): Promise<Opportunity[]> {
    return this.all(tx).filter((p) => p.ownerMemberId === memberId && !['ISSUED', 'LOST'].includes(p.stage)).map((p) => Opportunity.restore({ ...p }));
  }

  async forParty(tx: Transaction, partyId: string): Promise<Opportunity[]> {
    return this.all(tx).filter((p) => p.partyId === partyId).map((p) => Opportunity.restore({ ...p }));
  }

  private all(tx: Transaction): OpportunityProps[] {
    return [...this.items.of(tx).values()];
  }
}

export class InMemoryRoutingRuleRepository implements RoutingRuleRepository {
  private readonly rules = new TenantBuckets<RoutingRule[]>(() => []);
  private readonly cursors = new TenantBuckets<Map<string, string>>(() => new Map());

  async list(tx: Transaction): Promise<RoutingRule[]> {
    return structuredClone(this.rules.of(tx));
  }

  async replaceAll(tx: Transaction, rules: RoutingRule[]): Promise<void> {
    const bucket = this.rules.of(tx);
    bucket.splice(0, bucket.length, ...structuredClone(rules));
  }

  async cursor(tx: Transaction, ruleId: string): Promise<string | undefined> {
    return this.cursors.of(tx).get(ruleId);
  }

  async setCursor(tx: Transaction, ruleId: string, memberId: string): Promise<void> {
    this.cursors.of(tx).set(ruleId, memberId);
  }
}

export class InMemoryLeadImportRepository implements LeadImportRepository {
  private readonly batches = new TenantBuckets<Map<string, LeadImportBatch>>(() => new Map());
  private readonly rows = new TenantBuckets<Map<string, string>>(() => new Map());

  async findBatchByChecksum(tx: Transaction, checksum: string): Promise<LeadImportBatch | undefined> {
    return [...this.batches.of(tx).values()].find((b) => b.fileChecksum === checksum);
  }

  async saveBatch(tx: Transaction, b: LeadImportBatch): Promise<void> {
    this.batches.of(tx).set(b.id, { ...b });
  }

  async rowSeen(tx: Transaction, rowHash: string): Promise<boolean> {
    return this.rows.of(tx).has(rowHash);
  }

  async markRow(tx: Transaction, rowHash: string, batchId: string): Promise<void> {
    this.rows.of(tx).set(rowHash, batchId);
  }
}

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 10;

/** Anti-spam for public capture (honeypot + per-IP-hash rolling window). Postgres uses crm_public_lead_rate. */
export class InMemoryPublicLeadGuard implements PublicLeadGuard {
  private readonly hits = new TenantBuckets<Map<string, number[]>>(() => new Map());

  async check(tx: Transaction, input: { ipHash: string; honeypot?: string; at: Date }): Promise<void> {
    if (input.honeypot) throw new ValidationError('spam_detected', 'Submission rejected');
    const bucket = this.hits.of(tx);
    const recent = (bucket.get(input.ipHash) ?? []).filter((t) => t > input.at.getTime() - WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) throw new RateLimitedError('public_lead_rate_limited', 'Too many submissions; try again later', { retryAfterSeconds: 600 });
    bucket.set(input.ipHash, [...recent, input.at.getTime()]);
  }
}
