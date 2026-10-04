import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { MyWorkComposer, MyWorkContributor, MyWorkItem } from '../domain/my-work';
import { LeadRepository, MY_WORK_CONTRIBUTORS, PartyFacade, TaskRepository, Transaction } from './ports';
import { CrmContext } from './crm-context';

const SLA_RISK_WINDOW_MS = 30 * 60_000;

/** Overdue (priority 0) and today's (priority 1) open tasks. */
export class TaskContributor implements MyWorkContributor {
  readonly name = 'tasks';
  constructor(private readonly tasks: TaskRepository) {}

  async contribute(tx: Transaction, memberId: string, at: Date): Promise<MyWorkItem[]> {
    return (await this.tasks.openForOwner(tx, memberId))
      .map((t) => ({ t, bucket: t.bucket(at) }))
      .filter(({ bucket }) => bucket === 'OVERDUE' || bucket === 'TODAY')
      .map(({ t, bucket }) => ({
        kind: 'TASK' as const, id: t.props.id, title: t.props.title, dueAt: t.props.dueAt, priority: bucket === 'OVERDUE' ? 0 : 1,
        subject: { type: t.props.subjectType, id: t.props.subjectId }, actions: actionsFor(t.props.kind),
      }));
  }
}

/** The owner's HOT leads still in NEW/CONTACTED (priority 2). */
export class HotLeadContributor implements MyWorkContributor {
  readonly name = 'hot_leads';
  constructor(private readonly leads: LeadRepository, private readonly parties: PartyFacade) {}

  async contribute(tx: Transaction, memberId: string): Promise<MyWorkItem[]> {
    const hot = (await this.leads.openForOwner(tx, memberId)).filter((l) => l.props.temperature === 'HOT' && ['NEW', 'CONTACTED'].includes(l.props.stage));
    return Promise.all(hot.map(async (l) => ({
      kind: 'HOT_LEAD' as const, id: l.props.id, title: (await this.parties.summary(tx, l.props.partyId))?.displayName ?? 'Lead',
      subtitle: l.props.productInterest, priority: 2, subject: { type: 'LEAD', id: l.props.id }, actions: ['CALL', 'WHATSAPP', 'OPEN'] as MyWorkItem['actions'],
    })));
  }
}

/** Unanswered leads whose SLA falls due within 30 minutes (priority 0). */
export class SlaAtRiskContributor implements MyWorkContributor {
  readonly name = 'sla_at_risk';
  constructor(private readonly leads: LeadRepository, private readonly parties: PartyFacade) {}

  async contribute(tx: Transaction, memberId: string, at: Date): Promise<MyWorkItem[]> {
    const atRisk = (await this.leads.openForOwner(tx, memberId)).filter((l) => {
      const due = l.props.slaDueAt ? Date.parse(l.props.slaDueAt) : NaN;
      return l.slaState(at) === 'pending' && due - at.getTime() <= SLA_RISK_WINDOW_MS;
    });
    return Promise.all(atRisk.map(async (l) => ({
      kind: 'SLA_AT_RISK' as const, id: l.props.id, title: (await this.parties.summary(tx, l.props.partyId))?.displayName ?? 'Lead',
      subtitle: 'First response due', dueAt: l.props.slaDueAt, priority: 0, subject: { type: 'LEAD', id: l.props.id },
      actions: ['CALL', 'WHATSAPP', 'LOG'] as MyWorkItem['actions'],
    })));
  }
}

/** "Today" (F79): composed from contributors; a failing contributor degrades, never fails the page. */
@Injectable()
export class MyWorkService {
  private readonly contributors: MyWorkContributor[];
  private readonly composer: MyWorkComposer;

  constructor(
    @Inject(MY_WORK_CONTRIBUTORS) contributors: MyWorkContributor[],
    private readonly ctx: CrmContext,
  ) {
    this.contributors = [...contributors];
    this.composer = new MyWorkComposer(this.contributors, ctx.logger);
  }

  registerContributor(contributor: MyWorkContributor): void {
    if (!this.contributors.some(c => c.name === contributor.name)) this.contributors.push(contributor);
  }

  today(principal: Principal) {
    if (!principal.memberId) throw new ForbiddenError('member_required', 'This action needs a member identity');
    const memberId = principal.memberId;
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const items = await this.composer.compose(tx, memberId, this.ctx.clock.now());
      return {
        items,
        counts: {
          overdue: items.filter((i) => i.kind === 'TASK' && i.priority === 0).length,
          today: items.filter((i) => i.kind === 'TASK' && i.priority === 1).length,
          hotLeads: items.filter((i) => i.kind === 'HOT_LEAD').length,
        },
      };
    });
  }
}

export function defaultContributors(tasks: TaskRepository, leads: LeadRepository, parties: PartyFacade): MyWorkContributor[] {
  return [new TaskContributor(tasks), new HotLeadContributor(leads, parties), new SlaAtRiskContributor(leads, parties)];
}

function actionsFor(kind: string): MyWorkItem['actions'] {
  if (kind === 'CALL') return ['CALL', 'LOG', 'OPEN'];
  if (kind === 'WHATSAPP') return ['WHATSAPP', 'LOG', 'OPEN'];
  return ['LOG', 'OPEN'];
}

