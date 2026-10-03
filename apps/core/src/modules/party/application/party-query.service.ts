import { Inject, Injectable } from '@nestjs/common';
import { CustomFieldValidator, CustomFieldValues } from '../../../kernel/custom-fields';
import { Principal } from '../../../kernel/tenancy/principal';
import { Party } from '../domain/party';
import { ContactPointFactory } from '../domain/contact-point';
import { normaliseName } from '../domain/name-matching';
import {
  FIELD_CIPHER, FieldCipher, HOUSEHOLD_REPOSITORY, HouseholdRepository, PARTY_REPOSITORY, POLICY_NUMBER_LOOKUP, PartyRepository, PolicyNumberLookup,
  RECORD_SCOPE_PROVIDER, ROLE_LINK_REPOSITORY, RecordScopeProvider, RoleLinkRepository, Transaction,
} from './ports';
import { PartyContext } from './party-context';
import { inScope } from './party-scope';

const SEARCH_LIMIT = 25;

export type QueryKind = 'mobile' | 'email' | 'pan' | 'policy' | 'name';

/** Classifies a free-text search (AC-M03-10). Order matters: a PAN also looks like a policy number. */
export function classifyQuery(raw: string): QueryKind {
  const q = raw.trim();
  if (/^(\+?91)?[6-9]\d{9}$/.test(q.replace(/[\s-]/g, ''))) return 'mobile';
  if (q.includes('@')) return 'email';
  if (/^[A-Za-z]{5}\d{4}[A-Za-z]$/.test(q)) return 'pan';
  if (/^[A-Z0-9/-]{6,30}$/i.test(q) && /\d/.test(q)) return 'policy';
  return 'name';
}

export interface PartyListItem {
  id: string;
  displayName: string;
  primaryMobileMasked?: string;
  householdName?: string;
  rolesSummary: string[];
  tags: string[];
  ownerMemberId?: string;
  /** CR-001: P2 values masked as '****'. */
  customFields: CustomFieldValues;
}

/** Scoped customer lists and search for CRM04 (read side). */
@Injectable()
export class PartyQueryService {
  private readonly contacts: ContactPointFactory;

  constructor(
    @Inject(PARTY_REPOSITORY) private readonly parties: PartyRepository,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(ROLE_LINK_REPOSITORY) private readonly roles: RoleLinkRepository,
    @Inject(POLICY_NUMBER_LOOKUP) private readonly policies: PolicyNumberLookup,
    @Inject(RECORD_SCOPE_PROVIDER) private readonly scopes: RecordScopeProvider,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    private readonly ctx: PartyContext,
  ) {
    this.contacts = new ContactPointFactory(cipher);
  }

  list(principal: Principal, filter: { tag?: string; householdId?: string; cursor?: string; limit: number }): Promise<{ items: PartyListItem[]; nextCursor?: string }> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const scope = await this.scopes.resolve(tx, principal);
      const ids = filter.householdId ? ((await this.households.get(tx, filter.householdId))?.members.map((m) => m.partyId) ?? []) : undefined;
      const page = await this.parties.list(tx, { scope, tag: filter.tag, ids, cursor: filter.cursor, limit: filter.limit });
      return { items: await this.listItems(tx, page.items), nextCursor: page.nextCursor };
    });
  }

  search(principal: Principal, q: string): Promise<{ items: PartyListItem[]; kind: QueryKind }> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const scope = await this.scopes.resolve(tx, principal);
      const found = (await this.lookup(tx, q)).filter((p) => p.props.status === 'ACTIVE' && inScope(p, scope)).slice(0, SEARCH_LIMIT);
      return { items: await this.listItems(tx, found), kind: classifyQuery(q) };
    });
  }

  async listItems(tx: Transaction, parties: Party[]): Promise<PartyListItem[]> {
    const defs = await this.ctx.defs.activeFor(tx, 'party');
    return Promise.all(parties.map(async (p) => {
      const [household, roles] = await Promise.all([this.households.forParty(tx, p.props.id), this.roles.forParty(tx, p.props.id)]);
      return {
        id: p.props.id, displayName: p.props.displayName, primaryMobileMasked: p.primary('MOBILE')?.masked, householdName: household?.name,
        rolesSummary: [...new Set(roles.map((r) => (r.label ? `${r.role} · ${r.label}` : r.role)))], tags: [...p.props.tags], ownerMemberId: p.props.ownerMemberId,
        customFields: CustomFieldValidator.mask(defs, p.props.customFields),
      };
    }));
  }

  private async lookup(tx: Transaction, q: string): Promise<Party[]> {
    switch (classifyQuery(q)) {
      case 'mobile': return this.parties.findByContactHash(tx, await this.contacts.hashFor(tx.tenantId, 'MOBILE', q));
      case 'email': return this.parties.findByContactHash(tx, await this.contacts.hashFor(tx.tenantId, 'EMAIL', q));
      case 'pan': return this.parties.findByPanHash(tx, this.cipher.hash(tx.tenantId, q.trim().toUpperCase()));
      case 'policy': {
        const ids = await this.policies.partyIdsForPolicyNumber(tx, q.trim());
        return (await Promise.all(ids.map((id) => this.parties.get(tx, id)))).filter((p): p is Party => !!p);
      }
      default: {
        const prefix = normaliseName(q);
        return prefix.length < 2 ? [] : this.parties.searchByName(tx, prefix, SEARCH_LIMIT * 2);
      }
    }
  }
}
