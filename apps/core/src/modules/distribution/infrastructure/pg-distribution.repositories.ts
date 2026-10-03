import { istDate } from '../../../kernel/domain/ist';
import { ConflictError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { cursorOffset, encodeCursor } from '../../../kernel/http/pagination';
import { isPgTransaction, PgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { OrgTree, OrgUnit, OrgUnitKind } from '../domain/org-unit';
import { Member, MemberProps } from '../domain/member';
import { ChecklistItem, OnboardingChecklist } from '../domain/onboarding';
import { Licence, LicenceKind } from '../domain/licence';
import { RecordScopeKind, RoleCatalogue, RoleDefinition } from '../domain/roles';
import {
  ChecklistRepository, InsurerCodeRepository, LeaveRepository, LicenceRepository, MemberFilter, MemberRepository,
  OrgUnitRepository, ROOT_ORG_UNIT_ID, RoleRepository,
} from '../application/ports';

function pg(tx: Transaction): PgTransaction {
  if (!isPgTransaction(tx)) throw new Error('Postgres repository used outside a Postgres transaction');
  return tx;
}
const iso = (d: Date | null) => (d ? d.toISOString() : undefined);
const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === UNIQUE_VIOLATION;

interface OrgUnitRow { id: string; parent_id: string | null; kind: OrgUnitKind; name: string; territory_codes: string[] }

/**
 * Every tenant has a HEAD_OFFICE root (M02 §3.1), present from the start in the in-memory adapter. Idempotent, so
 * it runs before any write that may reference it — a fresh tenant can add members before anyone reads the tree.
 */
async function ensureRoot(tx: Transaction): Promise<void> {
  await pg(tx).query(
    `insert into org_unit (tenant_id, id, kind, name, territory_codes) values ($1, $2, 'HEAD_OFFICE', 'Head office', '{}') on conflict do nothing`,
    [tx.tenantId, ROOT_ORG_UNIT_ID]);
}

export class PgOrgUnitRepository implements OrgUnitRepository {
  async tree(tx: Transaction): Promise<OrgTree> {
    const q = pg(tx);
    await ensureRoot(tx);
    const { rows } = await q.query<OrgUnitRow>('select id, parent_id, kind, name, territory_codes from org_unit order by seq');
    return new OrgTree(rows.map((r) => ({ id: r.id, ...(r.parent_id ? { parentId: r.parent_id } : {}), kind: r.kind, name: r.name, territoryCodes: r.territory_codes })));
  }

  async save(tx: Transaction, unit: OrgUnit): Promise<void> {
    if (unit.id !== ROOT_ORG_UNIT_ID) await ensureRoot(tx);
    await pg(tx).query(
      `insert into org_unit (tenant_id, id, parent_id, kind, name, territory_codes) values ($1, $2, $3, $4, $5, $6)
       on conflict (tenant_id, id) do update set parent_id = excluded.parent_id, kind = excluded.kind, name = excluded.name, territory_codes = excluded.territory_codes`,
      [tx.tenantId, unit.id, unit.parentId ?? null, unit.kind, unit.name, unit.territoryCodes]);
  }

  /** Parents are written before children so the (tenant, parent) foreign key holds inside one transaction. */
  async saveAll(tx: Transaction, units: OrgUnit[]): Promise<void> {
    const ids = new Set(units.map((u) => u.id));
    const pending = [...units];
    const written = new Set<string>();
    while (pending.length > 0) {
      const next = pending.findIndex((u) => !u.parentId || !ids.has(u.parentId) || written.has(u.parentId));
      const [unit] = pending.splice(next === -1 ? 0 : next, 1);
      await this.save(tx, unit);
      written.add(unit.id);
    }
  }
}

interface MemberRow {
  id: string; user_ref: string | null; display_name: string; phone_masked: string | null; email_masked: string | null; contact_hash: string; roles: string[];
  salesperson_type: MemberProps['salespersonType'] | null; org_unit_id: string; status: MemberProps['status']; capacity_per_day: number; skills: string[]; languages: string[];
  invited_at: Date; invite_expires_at: Date; activated_at: Date | null; exited_at: Date | null; version: number;
}

const toMember = (r: MemberRow) => Member.restore({
  id: r.id, ...(r.user_ref ? { userRef: r.user_ref } : {}), displayName: r.display_name, ...(r.phone_masked ? { phoneMasked: r.phone_masked } : {}),
  ...(r.email_masked ? { emailMasked: r.email_masked } : {}), contactHash: r.contact_hash, roles: r.roles, ...(r.salesperson_type ? { salespersonType: r.salesperson_type } : {}),
  orgUnitId: r.org_unit_id, status: r.status, capacityPerDay: r.capacity_per_day, skills: r.skills, languages: r.languages, invitedAt: r.invited_at.toISOString(),
  ...(r.activated_at ? { activatedAt: iso(r.activated_at) } : {}), ...(r.exited_at ? { exitedAt: iso(r.exited_at) } : {}), inviteExpiresAt: r.invite_expires_at.toISOString(), version: r.version,
});

export class PgMemberRepository implements MemberRepository {
  async get(tx: Transaction, id: string): Promise<Member | undefined> {
    const { rows } = await pg(tx).query<MemberRow>('select * from member where id = $1', [id]);
    return rows[0] && toMember(rows[0]);
  }

  async findByContactHash(tx: Transaction, hash: string): Promise<Member | undefined> {
    const { rows } = await pg(tx).query<MemberRow>(`select * from member where contact_hash = $1 and status <> 'exited' order by invited_at, id limit 1`, [hash]);
    return rows[0] && toMember(rows[0]);
  }

  async findByUserRef(tx: Transaction, userRef: string): Promise<Member | undefined> {
    const { rows } = await pg(tx).query<MemberRow>('select * from member where user_ref = $1 limit 1', [userRef]);
    return rows[0] && toMember(rows[0]);
  }

  async list(tx: Transaction, f: MemberFilter): Promise<{ items: Member[]; nextCursor?: string }> {
    const offset = cursorOffset(f.cursor);
    const { rows } = await pg(tx).query<MemberRow>(
      `select * from member
        where ($1::text is null or status = $1)
          and ($2::text is null or $2 = any(roles))
          and ($3::text[] is null or org_unit_id = any($3))
          and ($4::text is null or id = $4)
          and ($5::text is null or salesperson_type = $5)
          and ($6::text is null or position(lower($6) in lower(display_name)) > 0)
        order by invited_at, id collate "C" limit $7 offset $8`,
      [f.status ?? null, f.role ?? null, f.orgUnitIds ?? null, f.memberId ?? null, f.salespersonType ?? null, f.q ?? null, f.limit + 1, offset]);
    const items = rows.slice(0, f.limit).map(toMember);
    return { items, nextCursor: rows.length > f.limit ? encodeCursor({ offset: offset + f.limit }) : undefined };
  }

  async countSeats(tx: Transaction): Promise<number> {
    const { rows } = await pg(tx).query<{ n: string }>(`select count(*) as n from member where status <> 'exited'`);
    return Number(rows[0].n);
  }

  async countByOrgUnit(tx: Transaction): Promise<Record<string, number>> {
    const { rows } = await pg(tx).query<{ org_unit_id: string; n: string }>(`select org_unit_id, count(*) as n from member where status <> 'exited' group by org_unit_id`);
    return Object.fromEntries(rows.map((r) => [r.org_unit_id, Number(r.n)]));
  }

  /** Optimistic: an existing row must still hold the aggregate's version; a new member must not duplicate an active contact. */
  async save(tx: Transaction, member: Member): Promise<void> {
    const q = pg(tx);
    await ensureRoot(tx); // members default to the head office, which must exist for the foreign key
    const p = member.props;
    const values = memberValues(tx.tenantId, p);
    const updated = await q.query(
      `update member set tenant_id = $2, user_ref = $3, display_name = $4, phone_masked = $5, email_masked = $6, contact_hash = $7, roles = $8, salesperson_type = $9, org_unit_id = $10,
         status = $11, capacity_per_day = $12, skills = $13, languages = $14, invited_at = $15, invite_expires_at = $16, activated_at = $17, exited_at = $18, version = $19
       where id = $1 and version = $19 - 1`, values);
    if (updated.rowCount === 0) await this.insertNew(q, p, values);
    member.markSaved();
  }

  private async insertNew(q: PgTransaction, p: Readonly<MemberProps>, values: unknown[]): Promise<void> {
    const exists = await q.query('select 1 from member where id = $1', [p.id]);
    if (exists.rowCount > 0) throw new PreconditionFailedError('version_mismatch', 'The member was changed by someone else; reload and retry');
    const taken = await q.query(`select 1 from member where contact_hash = $1 and status <> 'exited'`, [p.contactHash]);
    if (taken.rowCount > 0) throw memberExists();
    try {
      await q.query(
        `insert into member (id, tenant_id, user_ref, display_name, phone_masked, email_masked, contact_hash, roles, salesperson_type, org_unit_id, status, capacity_per_day,
           skills, languages, invited_at, invite_expires_at, activated_at, exited_at, version)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`, values);
    } catch (error) {
      throw isUniqueViolation(error) ? memberExists() : error;
    }
  }
}

const memberExists = () => new ConflictError('member_exists', 'A member with this contact already exists in this tenant');

const memberValues = (tenantId: string, p: Readonly<MemberProps>): unknown[] => [
  p.id, tenantId, p.userRef ?? null, p.displayName, p.phoneMasked ?? null, p.emailMasked ?? null, p.contactHash, p.roles, p.salespersonType ?? null, p.orgUnitId,
  p.status, p.capacityPerDay, p.skills, p.languages, p.invitedAt, p.inviteExpiresAt, p.activatedAt ?? null, p.exitedAt ?? null, p.version + 1,
];

export class PgChecklistRepository implements ChecklistRepository {
  async get(tx: Transaction, memberId: string): Promise<OnboardingChecklist | undefined> {
    const { rows } = await pg(tx).query<{ items: ChecklistItem[] }>('select items from onboarding_checklist where member_id = $1', [memberId]);
    return rows[0] && OnboardingChecklist.restore(rows[0].items);
  }

  async save(tx: Transaction, memberId: string, checklist: OnboardingChecklist): Promise<void> {
    await pg(tx).query(
      `insert into onboarding_checklist (tenant_id, member_id, items) values ($1, $2, $3::jsonb)
       on conflict (member_id) do update set items = excluded.items, updated_at = now()`,
      [tx.tenantId, memberId, JSON.stringify(checklist.items())]);
  }
}

interface LicenceRow { id: string; member_id: string; kind: LicenceKind; number: string; valid_from: string; valid_to: string; verified_at: Date | null }
const LICENCE_COLUMNS = `id, member_id, kind, number, to_char(valid_from, 'YYYY-MM-DD') as valid_from, to_char(valid_to, 'YYYY-MM-DD') as valid_to, verified_at`;
const toLicence = (r: LicenceRow): Licence => ({
  id: r.id, memberId: r.member_id, kind: r.kind, number: r.number, validFrom: r.valid_from, validTo: r.valid_to, ...(r.verified_at ? { verifiedAt: r.verified_at.toISOString() } : {}),
});

export class PgLicenceRepository implements LicenceRepository {
  async listForMember(tx: Transaction, memberId: string): Promise<Licence[]> {
    const { rows } = await pg(tx).query<LicenceRow>(`select ${LICENCE_COLUMNS} from licence where member_id = $1 order by seq`, [memberId]);
    return rows.map(toLicence);
  }

  async save(tx: Transaction, l: Licence): Promise<void> {
    await pg(tx).query(
      `insert into licence (id, tenant_id, member_id, kind, number, valid_from, valid_to, verified_at) values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set member_id = excluded.member_id, kind = excluded.kind, number = excluded.number, valid_from = excluded.valid_from,
         valid_to = excluded.valid_to, verified_at = excluded.verified_at`,
      [l.id, tx.tenantId, l.memberId, l.kind, l.number, l.validFrom, l.validTo, l.verifiedAt ?? null]);
  }

  async all(tx: Transaction): Promise<Licence[]> {
    const { rows } = await pg(tx).query<LicenceRow>(`select ${LICENCE_COLUMNS} from licence order by seq`);
    return rows.map(toLicence);
  }

  async alertedThresholds(tx: Transaction, licenceId: string): Promise<number[]> {
    const { rows } = await pg(tx).query<{ threshold: number }>('select threshold from licence_alert where licence_id = $1 order by seq', [licenceId]);
    return rows.map((r) => r.threshold);
  }

  /** A threshold is recorded once per licence (primary key); repeating it is a no-op. */
  async recordAlert(tx: Transaction, licenceId: string, threshold: number): Promise<void> {
    await pg(tx).query('insert into licence_alert (tenant_id, licence_id, threshold) values ($1, $2, $3) on conflict (licence_id, threshold) do nothing', [tx.tenantId, licenceId, threshold]);
  }
}

export class PgInsurerCodeRepository implements InsurerCodeRepository {
  async list(tx: Transaction, memberId: string): Promise<Array<{ insurerId: string; code: string }>> {
    const { rows } = await pg(tx).query<{ insurer_id: string; code: string }>('select insurer_id, code from insurer_code where member_id = $1 order by seq', [memberId]);
    return rows.map((r) => ({ insurerId: r.insurer_id, code: r.code }));
  }

  async put(tx: Transaction, memberId: string, insurerId: string, code: string): Promise<void> {
    const q = pg(tx);
    const taken = await q.query('select 1 from insurer_code where insurer_id = $1 and code = $2 and member_id <> $3', [insurerId, code, memberId]);
    if (taken.rowCount > 0) throw new ConflictError('insurer_code_taken', 'This insurer code is already assigned to another member');
    // Replace (delete + insert) so a re-assigned code moves to the end, like the in-memory adapter.
    await q.query('delete from insurer_code where member_id = $1 and insurer_id = $2', [memberId, insurerId]);
    try {
      await q.query('insert into insurer_code (tenant_id, member_id, insurer_id, code) values ($1, $2, $3, $4)', [tx.tenantId, memberId, insurerId, code]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('insurer_code_taken', 'This insurer code is already assigned to another member');
      throw error;
    }
  }
}

export class PgLeaveRepository implements LeaveRepository {
  async isOnLeave(tx: Transaction, memberId: string, at: Date): Promise<boolean> {
    const day = istDate(at);
    const { rowCount } = await pg(tx).query('select 1 from member_leave where member_id = $1 and from_date <= $2::date and $2::date <= to_date', [memberId, day]);
    return rowCount > 0;
  }

  async add(tx: Transaction, memberId: string, from: string, to: string): Promise<void> {
    await pg(tx).query(
      `insert into member_leave (tenant_id, member_id, from_date, to_date) values ($1, $2, $3, $4)
       on conflict (member_id, from_date) do update set to_date = greatest(member_leave.to_date, excluded.to_date)`,
      [tx.tenantId, memberId, from, to]);
  }
}

interface RoleRow { role: string; version: number; permissions: string[]; record_scope: RecordScopeKind | null; privileged: boolean | null; editable: boolean | null }

export class PgRoleRepository implements RoleRepository {
  async catalogue(tx: Transaction): Promise<RoleCatalogue> {
    const { rows } = await pg(tx).query<RoleRow>('select role, version, permissions, record_scope, privileged, editable from tenant_role order by role');
    const defaults = RoleCatalogue.defaults();
    const known = new Set(defaults.list().map((d) => d.role));
    const overrides = rows.filter((r) => known.has(r.role)).map((r): RoleDefinition => {
      const base = defaults.get(r.role);
      return { role: r.role, version: r.version, permissions: r.permissions, recordScope: r.record_scope ?? base.recordScope, privileged: r.privileged ?? base.privileged, editable: r.editable ?? base.editable };
    });
    return defaults.withOverrides(overrides);
  }

  async save(tx: Transaction, def: RoleDefinition): Promise<void> {
    await pg(tx).query(
      `insert into tenant_role (tenant_id, role, version, permissions, record_scope, privileged, editable) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (tenant_id, role) do update set version = excluded.version, permissions = excluded.permissions, record_scope = excluded.record_scope,
         privileged = excluded.privileged, editable = excluded.editable, updated_at = now()`,
      [tx.tenantId, def.role, def.version, def.permissions, def.recordScope, def.privileged, def.editable]);
  }
}
