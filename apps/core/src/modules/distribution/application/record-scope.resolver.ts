import { ForbiddenError } from '../../../kernel/errors/domain-errors';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { Principal } from '../../../kernel/tenancy/principal';
import { RecordScope, RecordScopeKind } from '../domain/roles';
import { OrgUnitRepository, ROOT_ORG_UNIT_ID, RoleRepository } from './ports';

const WIDTH: Record<RecordScopeKind, number> = { OWN: 0, UNIT_SUBTREE: 1, TENANT: 2 };

/** Which records a principal may see: widest scope across their roles wins (M02 §3.5). */
export class RecordScopeResolver {
  constructor(
    private readonly roles: RoleRepository,
    private readonly units: OrgUnitRepository,
  ) {}

  async resolve(tx: Transaction, principal: Principal): Promise<RecordScope> {
    const catalogue = await this.roles.catalogue(tx);
    const known = principal.roles.filter((r) => catalogue.list().some((d) => d.role === r));
    const kind = known.map((r) => catalogue.get(r).recordScope).reduce<RecordScopeKind>((a, b) => (WIDTH[b] > WIDTH[a] ? b : a), 'OWN');
    if (kind === 'TENANT') return { kind };
    if (kind === 'UNIT_SUBTREE') {
      return { kind, orgUnitIds: (await this.units.tree(tx)).subtreeIds(principal.orgUnitId ?? ROOT_ORG_UNIT_ID) };
    }
    if (!principal.memberId) throw new ForbiddenError('member_required', 'This action needs a member identity');
    return { kind, memberId: principal.memberId };
  }
}
