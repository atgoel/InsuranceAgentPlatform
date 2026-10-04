import { Inject, Injectable } from '@nestjs/common';
import { INBOX } from '../../../kernel/tokens';
import { Inbox } from '../../../kernel/outbox/inbox';
import { DomainEvent } from '../../../kernel/domain/domain-event';
import { BusinessRuleError, DependencyUnavailableError } from '../../../kernel/errors/domain-errors';
import { HeldPolicyService } from './held-policy.service';
import { BookContext } from './book-context';
import { HELD_POLICY_REPOSITORY, HeldPolicyRepository, ISSUED_POLICY_READER, IssuedPolicyReader } from './ports';
@Injectable()
export class UnavailableIssuedPolicyReader implements IssuedPolicyReader {
    async read(): Promise<never> { throw new DependencyUnavailableError('issued_policy_reader'); }
}
@Injectable()
export class BookSubscribers {
    constructor(
    @Inject(INBOX)
    private readonly inbox: Inbox,
    @Inject(ISSUED_POLICY_READER)
    private readonly issued: IssuedPolicyReader,
    @Inject(HELD_POLICY_REPOSITORY)
    private readonly policies: HeldPolicyRepository, private readonly held: HeldPolicyService, private readonly ctx: BookContext) { }
    onPolicyIssued(event: DomainEvent<{
        policySaleId: string;
        opportunityId?: string;
    }>) { return this.inbox.processOnce('book:issued', event.id, () => this.ctx.uow.run(event.tenantId, async (tx) => { if (await this.policies.findBySaleRef(tx, event.data.policySaleId))
        return; const snapshot = await this.issued.read(tx, event.data.policySaleId); if (!snapshot)
        throw new DependencyUnavailableError('issued_policy_reader'); if (!snapshot.insurerConfirmed)
        throw new BusinessRuleError('insurer_confirmation_required', 'Only insurer-confirmed sales enter the held book'); await this.held.registerIn(tx, { tenantId: tx.tenantId, userRef: 'book-issued', memberId: snapshot.policy.servicingMemberId, orgUnitId: snapshot.policy.orgUnitId, realm: 'workforce', roles: ['TENANT_ADMIN'] }, { ...snapshot.policy, policyNumber: snapshot.policyNumber }, 'PLATFORM_SALE', { saleRef: { policySaleId: snapshot.policySaleId, opportunityId: event.data.opportunityId } }); })); }
    onPartyMerged(event: DomainEvent<{
        survivorId: string;
        mergedId: string;
    }>) { return this.inbox.processOnce('book:merge', event.id, () => this.ctx.uow.run(event.tenantId, async (tx) => { for (const policy of await this.policies.forParty(tx, event.data.mergedId)) {
        policy.relinkProposer(event.data.mergedId, event.data.survivorId);
        await this.policies.save(tx, policy);
    } })); }
}
