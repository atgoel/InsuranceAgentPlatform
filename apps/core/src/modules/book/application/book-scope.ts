import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { PARTY_FACADE, PartyFacade } from '../../party/application/ports';
import { RECORD_SCOPE_PROVIDER, RecordScopeProvider } from '../../distribution/application/ports';
import { inScope } from '../../crm/application/crm-scope';
import { HeldPolicy } from '../domain/held-policy';
import { ImportBatch } from '../domain/book-import';
import { Transaction } from './ports';
@Injectable()
export class BookScope {
    constructor(
    @Inject(PARTY_FACADE)
    readonly parties: PartyFacade,
    @Inject(RECORD_SCOPE_PROVIDER)
    readonly scopes: RecordScopeProvider) { }
    async policy(tx: Transaction, p: Principal, policy: HeldPolicy | undefined, id: string): Promise<HeldPolicy> { if (!policy || !inScope({ ownerMemberId: policy.props.servicingMemberId, orgUnitId: policy.props.orgUnitId }, await this.scopes.resolve(tx, p)))
        throw new NotFoundError('held_policy', id); return policy; }
    async party(tx: Transaction, p: Principal, id: string) { const party = await this.parties.summary(tx, id); if (!party || !inScope(party, await this.scopes.resolve(tx, p)))
        throw new NotFoundError('party', id); return party; }
    async batch(tx: Transaction, p: Principal, batch: ImportBatch | undefined, id: string): Promise<ImportBatch> { if (!batch || !inScope({ ownerMemberId: batch.props.ownerMemberId, orgUnitId: batch.props.orgUnitId }, await this.scopes.resolve(tx, p)))
        throw new NotFoundError('book_import', id); return batch; }
}
