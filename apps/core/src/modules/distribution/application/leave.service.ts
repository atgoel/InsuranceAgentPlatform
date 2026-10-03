import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '../../../kernel/errors/domain-errors';
import { LEAVE_REPOSITORY, LeaveRepository } from './ports';
import { DistributionContext } from './distribution-context';
import { MemberService } from './member.service';

/** Leave periods exclude a seller from routing (F05 "capacity and leave"). */
@Injectable()
export class LeaveService {
  constructor(
    @Inject(LEAVE_REPOSITORY) private readonly leaves: LeaveRepository,
    private readonly members: MemberService,
    private readonly ctx: DistributionContext,
  ) {}

  add(tenantId: string, memberId: string, from: string, to: string): Promise<void> {
    if (to < from) throw new ValidationError('leave_dates_invalid', 'Leave must end on or after it starts');
    return this.ctx.uow.run(tenantId, async (tx) => {
      await this.members.require(tx, memberId);
      await this.leaves.add(tx, memberId, from, to);
      await this.ctx.recorder.record(tx, { audit: { action: 'distribution.leave.add', entityType: 'member', entityId: memberId, metadata: { from, to } } });
    });
  }
}
