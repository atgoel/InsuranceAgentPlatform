import { Inject, Injectable } from '@nestjs/common';
import { addDays, istDate } from '../../../kernel/domain/ist';
import { RENEWAL_OPPORTUNITY_PORT, RenewalOpportunityPort } from '../../crm/application/renewal-opportunity.port';
import { HELD_POLICY_REPOSITORY, HeldPolicyRepository } from './ports';
import { BookContext } from './book-context';
@Injectable()
export class RenewalOpportunityJob {
    constructor(
    @Inject(HELD_POLICY_REPOSITORY)
    private readonly policies: HeldPolicyRepository,
    @Inject(RENEWAL_OPPORTUNITY_PORT)
    private readonly renewals: RenewalOpportunityPort, private readonly ctx: BookContext) { }
    run(tenantId: string) { return this.ctx.uow.run(tenantId, async (tx) => { const today = istDate(this.ctx.clock.now()); let created = 0; for (const policy of await this.policies.renewalsBetween(tx, today, addDays(today, 45))) {
        const p = policy.props;
        if (p.line === 'LIFE' || !p.renewalDate || !p.servicingMemberId || ['CANCELLED', 'SURRENDERED', 'CLAIMED'].includes(p.status))
            continue;
        const result = await this.renewals.ensure(tx, { heldPolicyId: p.id, renewalDate: p.renewalDate, partyId: p.proposerPartyId, ownerMemberId: p.servicingMemberId, orgUnitId: p.orgUnitId, productName: p.productName, line: p.line, premiumPaise: p.premiumPaise });
        if (result.created)
            created++;
    } this.ctx.logger.info('job.completed', 'Renewal job completed', { job: 'book.renewals', created }); return { created }; }); }
}
