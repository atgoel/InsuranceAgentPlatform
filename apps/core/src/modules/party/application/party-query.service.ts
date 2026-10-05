import { Inject, Injectable } from '@nestjs/common';
import { Principal } from '../../../kernel/tenancy/principal';
import { Party } from '../domain/party';
import { ContactPointFactory } from '../domain/contact-point';
import { normaliseName } from '../domain/name-matching';
import {
  FIELD_CIPHER, FieldCipher, HOUSEHOLD_REPOSITORY, HouseholdRepository, PARTY_REPOSITORY, POLICY_NUMBER_LOOKUP, PartyRepository, PolicyNumberLookup,
  PARTY_BOOK_SEGMENT_READER, PartyBookSegmentReader,
  RECORD_SCOPE_PROVIDER, RecordScopeProvider, Transaction,
} from './ports';
import { PartyContext } from './party-context';
import { PartyListItem, PartyListItems } from './party-list-items';
export type { PartyListItem } from './party-list-items';
import { inScope } from './party-scope';
import { istDate } from '../../../kernel/domain/ist';
import { RecordScope } from './ports';

export type PartySegment = 'with_dues' | 'no_policy';

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

/** Scoped customer lists and search for CRM04 (read side). */
@Injectable()
export class PartyQueryService {
  private readonly contacts: ContactPointFactory;

  constructor(
    @Inject(PARTY_REPOSITORY) private readonly parties: PartyRepository,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(POLICY_NUMBER_LOOKUP) private readonly policies: PolicyNumberLookup,
    @Inject(RECORD_SCOPE_PROVIDER) private readonly scopes: RecordScopeProvider,
    @Inject(PARTY_BOOK_SEGMENT_READER) private readonly segments: PartyBookSegmentReader,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    private readonly items: PartyListItems,
    private readonly ctx: PartyContext,
  ) {
    this.contacts = new ContactPointFactory(cipher);
  }

  list(
    principal: Principal,
    filter: { tag?: string; householdId?: string; segment?: PartySegment; cursor?: string; limit: number },
  ): Promise<{ items: PartyListItem[]; nextCursor?: string }> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const scope = await this.scopes.resolve(tx, principal);
      const household = filter.householdId ? ((await this.households.get(tx, filter.householdId))?.members.map((m) => m.partyId) ?? []) : undefined;
      const segment = await this.segmentFilter(tx, scope, filter.segment);
      const ids = intersect(household, segment.ids);
      const page = await this.parties.list(tx, { scope, tag: filter.tag, ids, excludeIds: segment.excludeIds, cursor: filter.cursor, limit: filter.limit });
      return { items: await this.listItems(tx, page.items), nextCursor: page.nextCursor };
    });
  }

  search(principal: Principal, q: string, segment?: PartySegment): Promise<{ items: PartyListItem[]; kind: QueryKind }> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const scope = await this.scopes.resolve(tx, principal);
      const filter = await this.segmentFilter(tx, scope, segment);
      const found = (await this.lookup(tx, q))
        .filter((p) => p.props.status === 'ACTIVE' && inScope(p, scope) && (!filter.ids || filter.ids.includes(p.props.id)) && !filter.excludeIds?.includes(p.props.id))
        .slice(0, SEARCH_LIMIT);
      return { items: await this.listItems(tx, found), kind: classifyQuery(q) };
    });
  }

  /** Ids for a segment from the M07 reader, on the caller's transaction, scope and IST today (ADR-M03-customer-segments). */
  private async segmentFilter(
    tx: Transaction,
    scope: RecordScope,
    segment: PartySegment | undefined,
  ): Promise<{ ids?: string[]; excludeIds?: string[] }> {
    if (!segment) return {};
    if (segment === 'with_dues') return { ids: await this.segments.partyIdsWithDues(tx, scope, istDate(this.ctx.clock.now())) };
    return { excludeIds: await this.segments.partyIdsWithAnyPolicy(tx, scope) };
  }

  /** Owner display name for a single-record view (ADR-009). */
  ownerNameOf(tenantId: string, ownerMemberId: string | undefined): Promise<string | undefined> {
    return this.items.ownerNameOf(tenantId, ownerMemberId);
  }

  listItems(tx: Transaction, parties: Party[]): Promise<PartyListItem[]> {
    return this.items.build(tx, parties);
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

function intersect(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.filter((id) => b.includes(id));
}
