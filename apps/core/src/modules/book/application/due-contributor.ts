import { Injectable, Inject } from '@nestjs/common';
import { addDays, istDate, istAt } from '../../../kernel/domain/ist';
import { MyWorkContributor, MyWorkItem } from '../../crm/domain/my-work';
import { Transaction, SERVICING_REPOSITORY, ServicingRepository } from './ports';
import { DueService } from './due.service';
@Injectable()
export class DueContributor implements MyWorkContributor {
  readonly name = 'book_dues';
  constructor(private readonly dues: DueService) {}
  async contribute(tx: Transaction, memberId: string, at: Date): Promise<MyWorkItem[]> {
    const today = istDate(at);
    const policies = await this.dues.policies.dueBetween(tx, addDays(today, -30), today, { kind: 'OWN', memberId });
    return policies.flatMap((policy) => {
      const p = policy.props;
      if (p.servicingMemberId !== memberId) return [];
      const due = this.dues.engine.classify(p, today);
      if (due.status === 'RENEWAL_DUE' && due.dueDate !== today) return [];
      if (!['DUE_TODAY', 'IN_GRACE', 'RENEWAL_DUE'].includes(due.status)) return [];
      return [
        {
          kind: 'DUE' as const,
          id: p.id,
          title: p.productName,
          subtitle: due.status,
          dueAt: due.dueDate ? istAt(due.dueDate, 0, 0).toISOString() : undefined,
          priority: due.status === 'IN_GRACE' && due.graceEndsOn !== undefined && due.graceEndsOn <= addDays(today, 3) ? 0 : 1,
          subject: { type: 'HELD_POLICY', id: p.id },
          actions: ['WHATSAPP', 'OPEN'] as MyWorkItem['actions'],
        },
      ];
    });
  }
}
@Injectable()
export class ServicingContributor implements MyWorkContributor {
  readonly name = 'book_servicing';
  constructor(
    @Inject(SERVICING_REPOSITORY)
    private readonly requests: ServicingRepository,
    private readonly dues: DueService,
  ) {}
  async contribute(tx: Transaction, memberId: string, at: Date): Promise<MyWorkItem[]> {
    const requests = await this.requests.openFollowUpsBefore(tx, istDate(at));
    const items: MyWorkItem[] = [];
    for (const request of requests) {
      const policy = await this.dues.policies.get(tx, request.props.heldPolicyId);
      if (policy?.props.servicingMemberId !== memberId) continue;
      items.push({
        kind: 'TASK',
        id: request.props.id,
        title: `Servicing — ${request.props.kind}`,
        dueAt: request.props.followUpOn ? istAt(request.props.followUpOn, 0, 0).toISOString() : undefined,
        priority: request.props.followUpOn === istDate(at) ? 1 : 0,
        subject: { type: 'SERVICING_REQUEST', id: request.props.id },
        actions: ['OPEN', 'LOG'],
      });
    }
    return items;
  }
}
