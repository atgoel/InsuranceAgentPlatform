import { isPgTransaction, PgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { cursorOffset, encodeCursor } from '../../../kernel/http/pagination';
import { Party, PartyProps } from '../domain/party';
import { ContactPoint } from '../domain/contact-point';
import { ConsentChannel, ConsentLedger, ConsentPurpose, ConsentRecord } from '../domain/consent';
import { Suppression, SuppressionReason } from '../domain/suppression';
import { Household, HouseholdMember, Relation } from '../domain/household';
import { PartyRole, PartyRoleLink, roleLinkKey } from '../domain/party-role';
import { MergeRecord } from '../domain/merge';
import { normaliseName } from '../domain/name-matching';
import {
  ConsentRepository, DuplicateCandidate, DuplicateRepository, HouseholdRepository, PartyListFilter, PartyRepository, RoleLinkRepository,
  SuppressionRepository,
} from '../application/ports';

function pg(tx: Transaction): PgTransaction {
  if (!isPgTransaction(tx)) throw new Error('Postgres repository used outside a Postgres transaction');
  return tx;
}
const iso = (d: Date): string => d.toISOString();
const n = <T>(v: T | undefined): T | null => v ?? null;
const opt = <K extends string, V>(key: K, value: V | null | undefined): { [P in K]?: V } => (value === null || value === undefined ? {} : ({ [key]: value } as { [P in K]?: V }));

function pageOf<T>(rows: T[], offset: number, limit: number): { items: T[]; nextCursor?: string } {
  return { items: rows.slice(0, limit), ...(rows.length > limit ? { nextCursor: encodeCursor({ offset: offset + limit }) } : {}) };
}
const offsetOf = (cursor: string | undefined): number => (cursorOffset(cursor));

interface PartyRow {
  id: string; kind: PartyProps['kind']; display_name: string; dob_enc: string | null; dob_year: number | null; birthday: string | null; gender: 'F' | 'M' | 'X' | null;
  pan_enc: string | null; pan_hash: string | null; pan_last4: string | null; preferred_language: string; preferred_channel: string | null;
  owner_member_id: string | null; org_unit_id: string | null; tags: string[]; source_kind: PartyProps['source']['kind']; source_ref: string | null;
  status: PartyProps['status']; merged_into_id: string | null; created_at: Date; updated_at: Date; version: number; custom_fields: PartyProps['customFields'];
}
interface ContactRow { party_id: string; channel: ContactPoint['channel']; value_enc: string; value_hash: string; masked: string; is_primary: boolean; verified_at: Date | null }

const toContact = (r: ContactRow): ContactPoint => ({
  channel: r.channel, valueEnc: r.value_enc, valueHash: r.value_hash, masked: r.masked, isPrimary: r.is_primary, ...(r.verified_at ? { verifiedAt: iso(r.verified_at) } : {}),
});

const toParty = (r: PartyRow, contacts: ContactPoint[]): Party => Party.restore({
  id: r.id, kind: r.kind, displayName: r.display_name,
  ...opt('dateOfBirthEnc', r.dob_enc), ...opt('dobYear', r.dob_year), ...opt('birthday', r.birthday), ...opt('gender', r.gender),
  ...opt('panEnc', r.pan_enc), ...opt('panHash', r.pan_hash), ...opt('panLast4', r.pan_last4),
  preferredLanguage: r.preferred_language, ...opt('preferredChannel', r.preferred_channel),
  ...opt('ownerMemberId', r.owner_member_id), ...opt('orgUnitId', r.org_unit_id),
  tags: r.tags, source: { kind: r.source_kind, ...opt('ref', r.source_ref) }, status: r.status, ...opt('mergedIntoId', r.merged_into_id),
  contactPoints: contacts, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), version: r.version, customFields: r.custom_fields ?? {},
});

export class PgPartyRepository implements PartyRepository {
  async get(tx: Transaction, id: string): Promise<Party | undefined> {
    return (await this.load(pg(tx), { where: 'id = $1', params: [id] }))[0];
  }

  /** Optimistic like the in-memory adapter: an existing row must carry the aggregate's version; the stored version becomes version + 1. */
  async save(tx: Transaction, party: Party): Promise<void> {
    const c = pg(tx);
    const p = party.props;
    const existing = await c.query<{ version: number }>('select version from party where id = $1 for update', [p.id]);
    if (existing.rows[0] && existing.rows[0].version !== p.version) {
      throw new PreconditionFailedError('version_mismatch', 'The customer was changed by someone else; reload and retry');
    }
    const values = [
      p.id, c.tenantId, p.kind, p.displayName, normaliseName(p.displayName), n(p.dateOfBirthEnc), n(p.dobYear), n(p.gender),
      n(p.panEnc), n(p.panHash), n(p.panLast4), p.preferredLanguage, n(p.preferredChannel), n(p.ownerMemberId), n(p.orgUnitId),
      [...p.tags], p.source.kind, n(p.source.ref), p.status, n(p.mergedIntoId), p.createdAt, p.updatedAt, p.version + 1, JSON.stringify(p.customFields), n(p.birthday),
    ];
    if (existing.rows[0]) {
      await c.query(
        `update party set kind=$3, display_name=$4, display_name_norm=$5, dob_enc=$6, dob_year=$7, gender=$8, pan_enc=$9, pan_hash=$10, pan_last4=$11,
           preferred_language=$12, preferred_channel=$13, owner_member_id=$14, org_unit_id=$15, tags=$16, source_kind=$17, source_ref=$18, status=$19,
           merged_into_id=$20, created_at=$21, updated_at=$22, version=$23, custom_fields=$24::jsonb, birthday=$25
         where id = $1 and tenant_id = $2`, values);
    } else {
      await c.query(
        `insert into party (id, tenant_id, kind, display_name, display_name_norm, dob_enc, dob_year, gender, pan_enc, pan_hash, pan_last4, preferred_language,
           preferred_channel, owner_member_id, org_unit_id, tags, source_kind, source_ref, status, merged_into_id, created_at, updated_at, version, custom_fields, birthday)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25)`, values);
    }
    await c.query('delete from contact_point where party_id = $1', [p.id]);
    for (const [position, cp] of p.contactPoints.entries()) {
      await c.query(
        `insert into contact_point (tenant_id, party_id, channel, value_enc, value_hash, masked, is_primary, verified_at, position) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [c.tenantId, p.id, cp.channel, cp.valueEnc, cp.valueHash, cp.masked, cp.isPrimary, n(cp.verifiedAt), position]);
    }
    party.markSaved();
  }

  async findByContactHash(tx: Transaction, hash: string): Promise<Party[]> {
    return this.load(pg(tx), { where: `status = 'ACTIVE' and exists (select 1 from contact_point cp where cp.party_id = party.id and cp.value_hash = $1)`, params: [hash] });
  }

  async findByPanHash(tx: Transaction, hash: string): Promise<Party[]> {
    return this.load(pg(tx), { where: `status = 'ACTIVE' and pan_hash = $1`, params: [hash] });
  }

  /** Prefix match on the stored normalised name (party_name_norm_idx); the caller passes an already-normalised prefix. */
  async searchByName(tx: Transaction, prefix: string, limit: number): Promise<Party[]> {
    const escaped = prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    return this.load(pg(tx), { where: `status = 'ACTIVE' and display_name_norm like $1`, params: [`${escaped}%`], limit });
  }

  async list(tx: Transaction, f: PartyListFilter): Promise<{ items: Party[]; nextCursor?: string }> {
    const params: unknown[] = [];
    const where = [`status = 'ACTIVE'`];
    if (f.scope.kind === 'UNIT_SUBTREE') {
      params.push(f.scope.orgUnitIds ?? []);
      where.push(`org_unit_id = any($${params.length}::text[])`);
    } else if (f.scope.kind !== 'TENANT') {
      if (!f.scope.memberId) return { items: [] };
      params.push(f.scope.memberId);
      where.push(`owner_member_id = $${params.length}`);
    }
    if (f.tag) {
      params.push(f.tag);
      where.push(`$${params.length}::text = any(tags)`);
    }
    if (f.ids) {
      params.push(f.ids);
      where.push(`id = any($${params.length}::text[])`);
    }
    const offset = offsetOf(f.cursor);
    const rows = await this.load(pg(tx), { where: where.join(' and '), params, orderBy: 'display_name collate "und-x-icu", id', limit: f.limit + 1, offset });
    return pageOf(rows, offset, f.limit);
  }

  private async load(c: PgTransaction, q: { where: string; params: unknown[]; orderBy?: string; limit?: number; offset?: number }): Promise<Party[]> {
    const { where, params, orderBy = 'created_at, id', limit, offset = 0 } = q;
    const paging = limit === undefined ? '' : ` limit ${Math.trunc(limit)} offset ${Math.trunc(offset)}`;
    const { rows } = await c.query<PartyRow>(`select * from party where ${where} order by ${orderBy}${paging}`, params);
    if (rows.length === 0) return [];
    const cps = await c.query<ContactRow>('select * from contact_point where party_id = any($1::text[]) order by party_id, position', [rows.map((r) => r.id)]);
    const byParty = new Map<string, ContactPoint[]>();
    for (const r of cps.rows) byParty.set(r.party_id, [...(byParty.get(r.party_id) ?? []), toContact(r)]);
    return rows.map((r) => toParty(r, byParty.get(r.id) ?? []));
  }
}

interface ConsentRow {
  id: string; party_id: string; purpose: ConsentPurpose; channel: ConsentChannel; granted: boolean; notice_version: string;
  source: ConsentRecord['source']; evidence_ref: string | null; captured_by: string; occurred_at: Date;
}

/** The ledger is insert-only (the app role has no update/delete). */
export class PgConsentRepository implements ConsentRepository {
  async ledger(tx: Transaction, partyId: string): Promise<ConsentLedger> {
    const { rows } = await pg(tx).query<ConsentRow>('select * from consent_record where party_id = $1 order by occurred_at, id', [partyId]);
    return new ConsentLedger(rows.map((r) => ({
      id: r.id, partyId: r.party_id, purpose: r.purpose, channel: r.channel, granted: r.granted, noticeVersion: r.notice_version, source: r.source,
      ...opt('evidenceRef', r.evidence_ref), capturedBy: r.captured_by, occurredAt: iso(r.occurred_at),
    })));
  }

  async append(tx: Transaction, r: ConsentRecord): Promise<void> {
    const c = pg(tx);
    await c.query(
      `insert into consent_record (id, tenant_id, party_id, purpose, channel, granted, notice_version, source, evidence_ref, captured_by, occurred_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [r.id, c.tenantId, r.partyId, r.purpose, r.channel, r.granted, r.noticeVersion, r.source, r.evidenceRef ?? null, r.capturedBy, r.occurredAt]);
  }
}

interface SuppressionRow { id: string; contact_hash: string; channel: ConsentChannel; reason: SuppressionReason; from_at: Date; to_at: Date | null; created_by: string }

export class PgSuppressionRepository implements SuppressionRepository {
  async activeFor(tx: Transaction, contactHash: string, at: Date): Promise<Suppression[]> {
    const { rows } = await pg(tx).query<SuppressionRow>(
      'select * from suppression where contact_hash = $1 and from_at <= $2 and (to_at is null or to_at > $2) order by from_at, id', [contactHash, at]);
    return rows.map((r) => ({
      id: r.id, contactHash: r.contact_hash, channel: r.channel, reason: r.reason, from: iso(r.from_at), ...(r.to_at ? { to: iso(r.to_at) } : {}), createdBy: r.created_by,
    }));
  }

  async add(tx: Transaction, s: Suppression): Promise<void> {
    const c = pg(tx);
    await c.query(
      'insert into suppression (id, tenant_id, contact_hash, channel, reason, from_at, to_at, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [s.id, c.tenantId, s.contactHash, s.channel, s.reason, s.from, s.to ?? null, s.createdBy]);
  }
}

export class PgHouseholdRepository implements HouseholdRepository {
  async forParty(tx: Transaction, partyId: string): Promise<Household | undefined> {
    const { rows } = await pg(tx).query<{ household_id: string }>('select household_id from household_member where party_id = $1', [partyId]);
    return rows[0] ? this.get(tx, rows[0].household_id) : undefined;
  }

  async get(tx: Transaction, id: string): Promise<Household | undefined> {
    const c = pg(tx);
    const h = await c.query<{ id: string; name: string }>('select id, name from household where id = $1', [id]);
    if (!h.rows[0]) return undefined;
    const m = await c.query<{ party_id: string; relation: Relation }>('select party_id, relation from household_member where household_id = $1 order by position', [id]);
    const members: HouseholdMember[] = m.rows.map((r) => ({ partyId: r.party_id, relation: r.relation }));
    return Household.restore({ id: h.rows[0].id, name: h.rows[0].name, members });
  }

  async save(tx: Transaction, h: Household): Promise<void> {
    const c = pg(tx);
    await c.query(
      `insert into household (id, tenant_id, name, head_party_id) values ($1,$2,$3,$4)
       on conflict (id) do update set name = excluded.name, head_party_id = excluded.head_party_id`, [h.id, c.tenantId, h.name, h.headPartyId]);
    await c.query('delete from household_member where household_id = $1', [h.id]);
    for (const [position, m] of h.members.entries()) {
      await c.query('insert into household_member (tenant_id, household_id, party_id, relation, position) values ($1,$2,$3,$4,$5)', [c.tenantId, h.id, m.partyId, m.relation, position]);
    }
  }
}

interface RoleLinkRow { party_id: string; role: PartyRole; subject_type: PartyRoleLink['subjectType']; subject_id: string; label: string | null; created_at: Date }
const toLink = (r: RoleLinkRow): PartyRoleLink => ({
  partyId: r.party_id, role: r.role, subjectType: r.subject_type, subjectId: r.subject_id, ...opt('label', r.label), createdAt: iso(r.created_at),
});

export class PgRoleLinkRepository implements RoleLinkRepository {
  async forSubject(tx: Transaction, subjectType: PartyRoleLink['subjectType'], subjectId: string): Promise<PartyRoleLink[]> {
    const {rows} = await pg(tx).query<RoleLinkRow>('select * from party_role_link where subject_type=$1 and subject_id=$2 order by party_id, role', [subjectType,subjectId]);
    return rows.map(toLink);
  }

  async forParty(tx: Transaction, partyId: string): Promise<PartyRoleLink[]> {
    const { rows } = await pg(tx).query<RoleLinkRow>('select * from party_role_link where party_id = $1 order by created_at, role, subject_type, subject_id', [partyId]);
    return rows.map(toLink);
  }

  async add(tx: Transaction, l: PartyRoleLink): Promise<void> {
    const c = pg(tx);
    await c.query(
      `insert into party_role_link (tenant_id, party_id, role, subject_type, subject_id, label, created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
      [c.tenantId, l.partyId, l.role, l.subjectType, l.subjectId, l.label ?? null, l.createdAt]);
  }

  /**
   * Moves links not already held by the target. A link the target already holds stays on the source and is not
   * reported as moved, so reversing the merge (repoint back with onlyKeys) restores both parties exactly.
   */
  async repoint(tx: Transaction, fromPartyId: string, toPartyId: string, onlyKeys?: readonly string[]): Promise<string[]> {
    const c = pg(tx);
    const { rows } = await c.query<RoleLinkRow>('select * from party_role_link where party_id = $1 order by created_at, role, subject_type, subject_id', [fromPartyId]);
    const held = new Set((await c.query<RoleLinkRow>('select * from party_role_link where party_id = $1', [toPartyId])).rows.map((r) => roleLinkKey(toLink(r))));
    const moved: string[] = [];
    for (const r of rows) {
      const link = toLink(r);
      const key = roleLinkKey(link);
      if ((onlyKeys && !onlyKeys.includes(key)) || held.has(key)) continue;
      await c.query('update party_role_link set party_id = $2 where party_id = $1 and role = $3 and subject_type = $4 and subject_id = $5', [fromPartyId, toPartyId, r.role, r.subject_type, r.subject_id]);
      moved.push(key);
    }
    return moved;
  }
}

interface CandidateRow { id: string; party_a_id: string; party_b_id: string; score: number; rule: string; explanation: string; status: DuplicateCandidate['status']; created_at: Date }
const toCandidate = (r: CandidateRow): DuplicateCandidate => ({
  id: r.id, partyAId: r.party_a_id, partyBId: r.party_b_id, score: r.score, rule: r.rule, explanation: r.explanation, status: r.status, createdAt: iso(r.created_at),
});

interface MergeRow {
  id: string; survivor_id: string; merged_id: string; choices: MergeRecord['choices']; moved_links: MergeRecord['movedLinks'];
  merged_at: Date; merged_by: string; reversible_until: Date; reversed_at: Date | null;
}

export class PgDuplicateRepository implements DuplicateRepository {
  /** Unique on the ordered pair; an existing open candidate keeps its id and takes the higher score (rule and explanation with it). */
  async upsertCandidate(tx: Transaction, cand: DuplicateCandidate): Promise<void> {
    const c = pg(tx);
    await c.query(
      `insert into duplicate_candidate (id, tenant_id, party_a_id, party_b_id, score, rule, explanation, status, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (tenant_id, party_a_id, party_b_id) do update set score = excluded.score, rule = excluded.rule, explanation = excluded.explanation
       where duplicate_candidate.status = 'open' and excluded.score > duplicate_candidate.score`,
      [cand.id, c.tenantId, cand.partyAId, cand.partyBId, cand.score, cand.rule, cand.explanation, cand.status, cand.createdAt]);
  }

  async list(tx: Transaction, f: { status: 'open'; partyId?: string; cursor?: string; limit: number }) {
    const offset = offsetOf(f.cursor);
    const { rows } = await pg(tx).query<CandidateRow>(
      `select * from duplicate_candidate where status = $1 and ($2::text is null or party_a_id = $2 or party_b_id = $2)
       order by score desc, created_at, id limit $3 offset $4`, [f.status, f.partyId ?? null, f.limit + 1, offset]);
    return pageOf(rows.map(toCandidate), offset, f.limit);
  }

  async get(tx: Transaction, id: string): Promise<DuplicateCandidate | undefined> {
    const { rows } = await pg(tx).query<CandidateRow>('select * from duplicate_candidate where id = $1', [id]);
    return rows[0] && toCandidate(rows[0]);
  }

  async setStatus(tx: Transaction, id: string, status: DuplicateCandidate['status']): Promise<void> {
    await pg(tx).query('update duplicate_candidate set status = $2 where id = $1', [id, status]);
  }

  async saveMerge(tx: Transaction, m: MergeRecord): Promise<void> {
    const c = pg(tx);
    await c.query(
      `insert into party_merge (id, tenant_id, survivor_id, merged_id, choices, moved_links, merged_at, merged_by, reversible_until, reversed_at)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10)
       on conflict (id) do update set choices = excluded.choices, moved_links = excluded.moved_links, merged_at = excluded.merged_at,
         merged_by = excluded.merged_by, reversible_until = excluded.reversible_until, reversed_at = excluded.reversed_at`,
      [m.id, c.tenantId, m.survivorId, m.mergedId, JSON.stringify(m.choices), JSON.stringify(m.movedLinks), m.mergedAt, m.mergedBy, m.reversibleUntil, m.reversedAt ?? null]);
  }

  async getMerge(tx: Transaction, id: string): Promise<MergeRecord | undefined> {
    const { rows } = await pg(tx).query<MergeRow>('select * from party_merge where id = $1', [id]);
    const r = rows[0];
    return r && {
      id: r.id, survivorId: r.survivor_id, mergedId: r.merged_id, choices: r.choices, movedLinks: r.moved_links, mergedAt: iso(r.merged_at), mergedBy: r.merged_by,
      reversibleUntil: iso(r.reversible_until), ...(r.reversed_at ? { reversedAt: iso(r.reversed_at) } : {}),
    };
  }
}
