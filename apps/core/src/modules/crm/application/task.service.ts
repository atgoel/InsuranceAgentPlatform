import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { Task, TaskKind } from '../domain/task';
import { CRM_EVENTS } from '../domain/events';
import { CRM_PORT_FACTORY, RECORD_SCOPE_PROVIDER, RecordScopeProvider, SELLER_DIRECTORY, SellerDirectory, TASK_REPOSITORY, TaskRepository, Transaction } from './ports';
import { DefaultCrmPortFactory } from './crm-port';
import { CrmContext } from './crm-context';

type Bucket = 'OVERDUE' | 'TODAY' | 'UPCOMING';
const BUCKETS: Bucket[] = ['OVERDUE', 'TODAY', 'UPCOMING'];

export interface TaskPatch {
  status?: 'DONE' | 'CANCELLED';
  outcome?: string;
  dueAt?: string;
  ownerMemberId?: string;
}

/** Tasks (CRM05/M17): bucketed lists in IST, completion, reassignment, 24 h escalation job (AC-M04-09). */
@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(RECORD_SCOPE_PROVIDER) private readonly scopes: RecordScopeProvider,
    @Inject(CRM_PORT_FACTORY) private readonly ports: DefaultCrmPortFactory,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
    private readonly ctx: CrmContext,
  ) {}

  list(principal: Principal, q: { mine: boolean; bucket?: Bucket; kind?: TaskKind; owner?: string; cursor?: string; limit: number }) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const at = this.ctx.clock.now();
      const visible = await this.visibleOwners(tx, principal);
      const wanted = q.mine ? [principal.memberId ?? '__none__'] : q.owner ? [q.owner] : undefined;
      const ownerMemberIds = intersect(visible, wanted);
      const page = await this.tasks.list(tx, { ownerMemberIds, status: 'OPEN', kind: q.kind, at, cursor: q.cursor, limit: q.limit });
      const withBucket = page.items.map((t) => ({ task: t, bucket: t.bucket(at) as Bucket }));
      const counts = { overdue: 0, today: 0, upcoming: 0 };
      for (const { bucket } of withBucket) counts[bucket.toLowerCase() as keyof typeof counts] += 1;
      const groups = BUCKETS.filter((b) => !q.bucket || b === q.bucket).map((bucket) => ({
        bucket, items: withBucket.filter((x) => x.bucket === bucket).map((x) => taskView(x.task, at)),
      }));
      return { groups, counts, nextCursor: page.nextCursor };
    });
  }

  create(principal: Principal, input: { subjectType: Task['props']['subjectType']; subjectId: string; kind: TaskKind; title: string; dueAt: string; ownerMemberId?: string }) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const ownerMemberId = input.ownerMemberId ?? principal.memberId;
      if (!ownerMemberId) throw new ForbiddenError('member_required', 'This action needs a member identity');
      const task = Task.create({ ...input, ownerMemberId, id: this.ctx.ids.next('tsk'), source: 'MANUAL', now: this.ctx.clock.now() });
      await (await this.ports.forTenant(tx.tenantId)).saveTask(tx, task);
      return taskView(task, this.ctx.clock.now());
    });
  }

  update(principal: Principal, id: string, patch: TaskPatch, expectedVersion: number) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const task = await this.requireInScope(tx, principal, id);
      if (task.props.version !== expectedVersion) throw new PreconditionFailedError('version_mismatch', 'The task was changed by someone else; reload and retry');
      const now = this.ctx.clock.now();
      if (patch.dueAt) task.reschedule(new Date(patch.dueAt));
      if (patch.ownerMemberId) task.reassign(patch.ownerMemberId);
      if (patch.status === 'DONE') task.complete(patch.outcome, now);
      if (patch.status === 'CANCELLED') task.cancel(now);
      await (await this.ports.forTenant(tx.tenantId)).saveTask(tx, task);
      return taskView(task, now);
    });
  }

  /** Job: overdue > 24 h and not yet escalated → escalate once and tell the manager (event). */
  escalateOverdue(tenantId: string, limit = 200): Promise<{ escalated: number }> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const now = this.ctx.clock.now();
      let escalated = 0;
      for (const task of await this.tasks.escalationCandidates(tx, now, limit)) {
        if (!task.needsEscalation(now)) continue;
        task.markEscalated(now);
        await this.tasks.save(tx, task);
        await this.ctx.recorder.record(tx, {
          event: { type: CRM_EVENTS.TASK_ESCALATED, subject: task.props.id, data: { taskId: task.props.id, ownerMemberId: task.props.ownerMemberId } },
          audit: { action: CRM_EVENTS.TASK_ESCALATED, entityType: 'task', entityId: task.props.id },
        });
        escalated += 1;
      }
      return { escalated };
    });
  }

  private async requireInScope(tx: Transaction, principal: Principal, id: string): Promise<Task> {
    const task = await this.tasks.get(tx, id);
    const visible = await this.visibleOwners(tx, principal);
    if (!task || (visible && !visible.includes(task.props.ownerMemberId))) throw new NotFoundError('task', id);
    return task;
  }

  /** Tasks carry only their owner: scope resolves to owner ids (undefined = whole tenant). */
  private async visibleOwners(tx: Transaction, principal: Principal): Promise<string[] | undefined> {
    const scope = await this.scopes.resolve(tx, principal);
    if (scope.kind === 'TENANT') return undefined;
    const self = principal.memberId ? [principal.memberId] : [];
    if (scope.kind === 'OWN') return self;
    const team = await this.sellers.eligibleSellers(tx, { orgUnitIds: scope.orgUnitIds ?? [], at: this.ctx.clock.now() });
    return [...new Set([...self, ...team.map((s) => s.memberId)])];
  }
}

function intersect(visible: string[] | undefined, wanted: string[] | undefined): string[] | undefined {
  if (!visible) return wanted;
  return wanted ? wanted.filter((id) => visible.includes(id)) : visible;
}

export function taskView(t: Task, at: Date) {
  return { ...t.props, bucket: t.bucket(at), etag: `"v${t.props.version}"` };
}
