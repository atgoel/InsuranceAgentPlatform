import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { TenantBuckets } from '../../../kernel/persistence/tenant-buckets';
import { PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { decodeCursor, encodeCursor } from '../../../kernel/http/pagination';
import { Party, PartyProps } from '../domain/party';
import { ConsentLedger, ConsentRecord } from '../domain/consent';
import { Suppression, isActive } from '../domain/suppression';
import { Household, HouseholdMember } from '../domain/household';
import { PartyRoleLink, roleLinkKey } from '../domain/party-role';
import { MergeRecord } from '../domain/merge';
import { normaliseName } from '../domain/name-matching';
import {
  ConsentRepository, DuplicateCandidate, DuplicateRepository, HouseholdRepository, PartyListFilter, PartyRepository, PolicyNumberLookup,
  RoleLinkRepository, SuppressionRepository,
} from '../application/ports';
import { inScope } from '../application/party-scope';

function page<T>(all: T[], cursor: string | undefined, limit: number): { items: T[]; nextCursor?: string } {
  const start = cursor ? Number(decodeCursor(cursor).offset ?? 0) : 0;
  return { items: all.slice(start, start + limit), nextCursor: start + limit < all.length ? encodeCursor({ offset: start + limit }) : undefined };
}

const clone = (p: PartyProps): PartyProps => ({ ...p, tags: [...p.tags], contactPoints: p.contactPoints.map((c) => ({ ...c })), source: { ...p.source } });

export class InMemoryPartyRepository implements PartyRepository {
  private readonly parties = new TenantBuckets<Map<string, PartyProps>>(() => new Map());

  async get(tx: Transaction, id: string): Promise<Party | undefined> {
    const p = this.parties.of(tx).get(id);
    return p && Party.restore(clone(p));
  }

  async save(tx: Transaction, party: Party): Promise<void> {
    const bucket = this.parties.of(tx);
    const stored = bucket.get(party.props.id);
    if (stored && stored.version !== party.props.version) throw new PreconditionFailedError('version_mismatch', 'The customer was changed by someone else; reload and retry');
    bucket.set(party.props.id, clone({ ...party.props, version: party.props.version + 1 }));
    party.markSaved();
  }

  async findByContactHash(tx: Transaction, hash: string): Promise<Party[]> {
    return this.active(tx).filter((p) => p.contactPoints.some((c) => c.valueHash === hash)).map((p) => Party.restore(clone(p)));
  }

  async findByPanHash(tx: Transaction, hash: string): Promise<Party[]> {
    return this.active(tx).filter((p) => p.panHash === hash).map((p) => Party.restore(clone(p)));
  }

  async searchByName(tx: Transaction, prefix: string, limit: number): Promise<Party[]> {
    return this.active(tx).filter((p) => normaliseName(p.displayName).startsWith(prefix)).slice(0, limit).map((p) => Party.restore(clone(p)));
  }

  async list(tx: Transaction, f: PartyListFilter): Promise<{ items: Party[]; nextCursor?: string }> {
    const all = this.active(tx)
      .map((p) => Party.restore(clone(p)))
      .filter((p) => inScope(p, f.scope) && (!f.tag || p.props.tags.includes(f.tag)) && (!f.ids || f.ids.includes(p.props.id)))
      .sort((a, b) => a.props.displayName.localeCompare(b.props.displayName) || a.props.id.localeCompare(b.props.id));
    return page(all, f.cursor, f.limit);
  }

  private active(tx: Transaction): PartyProps[] {
    return [...this.parties.of(tx).values()].filter((p) => p.status === 'ACTIVE');
  }
}

export class InMemoryConsentRepository implements ConsentRepository {
  private readonly records = new TenantBuckets<ConsentRecord[]>(() => []);

  async ledger(tx: Transaction, partyId: string): Promise<ConsentLedger> {
    return new ConsentLedger(this.records.of(tx).filter((r) => r.partyId === partyId));
  }

  async append(tx: Transaction, r: ConsentRecord): Promise<void> {
    this.records.of(tx).push({ ...r });
  }
}

export class InMemorySuppressionRepository implements SuppressionRepository {
  private readonly items = new TenantBuckets<Suppression[]>(() => []);

  async activeFor(tx: Transaction, contactHash: string, at: Date): Promise<Suppression[]> {
    return this.items.of(tx).filter((s) => s.contactHash === contactHash && isActive(s, at));
  }

  async add(tx: Transaction, s: Suppression): Promise<void> {
    this.items.of(tx).push({ ...s });
  }
}

export class InMemoryHouseholdRepository implements HouseholdRepository {
  private readonly items = new TenantBuckets<Map<string, { id: string; name: string; members: HouseholdMember[] }>>(() => new Map());

  async forParty(tx: Transaction, partyId: string): Promise<Household | undefined> {
    const h = [...this.items.of(tx).values()].find((x) => x.members.some((m) => m.partyId === partyId));
    return h && Household.restore(h);
  }

  async get(tx: Transaction, id: string): Promise<Household | undefined> {
    const h = this.items.of(tx).get(id);
    return h && Household.restore(h);
  }

  async save(tx: Transaction, h: Household): Promise<void> {
    this.items.of(tx).set(h.id, { id: h.id, name: h.name, members: h.members.map((m) => ({ ...m })) });
  }
}

export class InMemoryRoleLinkRepository implements RoleLinkRepository {
  private readonly links = new TenantBuckets<PartyRoleLink[]>(() => []);

  async forParty(tx: Transaction, partyId: string): Promise<PartyRoleLink[]> {
    return this.links.of(tx).filter((l) => l.partyId === partyId).map((l) => ({ ...l }));
  }

  async add(tx: Transaction, l: PartyRoleLink): Promise<void> {
    const all = this.links.of(tx);
    if (!all.some((x) => x.partyId === l.partyId && roleLinkKey(x) === roleLinkKey(l))) all.push({ ...l });
  }

  async repoint(tx: Transaction, fromPartyId: string, toPartyId: string, onlyKeys?: readonly string[]): Promise<string[]> {
    const all = this.links.of(tx);
    const moved: string[] = [];
    for (let i = 0; i < all.length; i++) {
      const l = all[i];
      if (l.partyId !== fromPartyId || (onlyKeys && !onlyKeys.includes(roleLinkKey(l)))) continue;
      all[i] = { ...l, partyId: toPartyId };
      moved.push(roleLinkKey(l));
    }
    return moved;
  }
}

export class InMemoryDuplicateRepository implements DuplicateRepository {
  private readonly candidates = new TenantBuckets<Map<string, DuplicateCandidate>>(() => new Map());
  private readonly merges = new TenantBuckets<Map<string, MergeRecord>>(() => new Map());

  async upsertCandidate(tx: Transaction, c: DuplicateCandidate): Promise<void> {
    const bucket = this.candidates.of(tx);
    const existing = [...bucket.values()].find((x) => x.partyAId === c.partyAId && x.partyBId === c.partyBId);
    if (!existing) bucket.set(c.id, { ...c });
    else if (existing.status === 'open' && c.score > existing.score) bucket.set(existing.id, { ...existing, score: c.score, rule: c.rule, explanation: c.explanation });
  }

  async list(tx: Transaction, f: { status: 'open'; partyId?: string; cursor?: string; limit: number }) {
    const all = [...this.candidates.of(tx).values()]
      .filter((c) => c.status === f.status && (!f.partyId || c.partyAId === f.partyId || c.partyBId === f.partyId))
      .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return page(all, f.cursor, f.limit);
  }

  async get(tx: Transaction, id: string): Promise<DuplicateCandidate | undefined> {
    const c = this.candidates.of(tx).get(id);
    return c && { ...c };
  }

  async setStatus(tx: Transaction, id: string, status: DuplicateCandidate['status']): Promise<void> {
    const c = this.candidates.of(tx).get(id);
    if (c) this.candidates.of(tx).set(id, { ...c, status });
  }

  async saveMerge(tx: Transaction, m: MergeRecord): Promise<void> {
    this.merges.of(tx).set(m.id, { ...m });
  }

  async getMerge(tx: Transaction, id: string): Promise<MergeRecord | undefined> {
    const m = this.merges.of(tx).get(id);
    return m && { ...m };
  }
}

/** Default until M07 provides held policies. */
export class NoPolicyNumberLookup implements PolicyNumberLookup {
  async partyIdsForPolicyNumber(): Promise<string[]> {
    return [];
  }
}
