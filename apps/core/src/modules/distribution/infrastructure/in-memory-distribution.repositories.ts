import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { TenantBuckets } from '../../../kernel/persistence/tenant-buckets';
import { ConflictError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { decodeCursor, encodeCursor } from '../../../kernel/http/pagination';
import { OrgTree, OrgUnit } from '../domain/org-unit';
import { Member, MemberProps } from '../domain/member';
import { ChecklistItem, OnboardingChecklist } from '../domain/onboarding';
import { Licence } from '../domain/licence';
import { RoleCatalogue, RoleDefinition } from '../domain/roles';
import {
  ChecklistRepository, InsurerCodeRepository, LeaveRepository, LicenceRepository, MemberFilter, MemberRepository,
  OrgUnitRepository, ROOT_ORG_UNIT_ID, RoleRepository,
} from '../application/ports';

const ROOT: OrgUnit = { id: ROOT_ORG_UNIT_ID, kind: 'HEAD_OFFICE', name: 'Head office', territoryCodes: [] };

export class InMemoryOrgUnitRepository implements OrgUnitRepository {
  private readonly units = new TenantBuckets<Map<string, OrgUnit>>(() => new Map([[ROOT.id, { ...ROOT }]]));

  async tree(tx: Transaction): Promise<OrgTree> {
    return new OrgTree([...this.units.of(tx).values()].map((u) => ({ ...u })));
  }

  async save(tx: Transaction, unit: OrgUnit): Promise<void> {
    this.units.of(tx).set(unit.id, { ...unit });
  }

  async saveAll(tx: Transaction, units: OrgUnit[]): Promise<void> {
    for (const unit of units) await this.save(tx, unit);
  }
}

export class InMemoryMemberRepository implements MemberRepository {
  private readonly members = new TenantBuckets<Map<string, MemberProps>>(() => new Map());

  async get(tx: Transaction, id: string): Promise<Member | undefined> {
    const props = this.members.of(tx).get(id);
    return props && Member.restore({ ...props });
  }

  async findByContactHash(tx: Transaction, hash: string): Promise<Member | undefined> {
    const props = [...this.members.of(tx).values()].find((m) => m.contactHash === hash && m.status !== 'exited');
    return props && Member.restore({ ...props });
  }

  async findByUserRef(tx: Transaction, userRef: string): Promise<Member | undefined> {
    const props = [...this.members.of(tx).values()].find((m) => m.userRef === userRef);
    return props && Member.restore({ ...props });
  }

  async list(tx: Transaction, f: MemberFilter): Promise<{ items: Member[]; nextCursor?: string }> {
    const q = f.q?.toLowerCase();
    const all = [...this.members.of(tx).values()]
      .filter((m) => (!f.status || m.status === f.status) && (!f.role || m.roles.includes(f.role)))
      .filter((m) => (!f.orgUnitIds || f.orgUnitIds.includes(m.orgUnitId)) && (!f.memberId || m.id === f.memberId))
      .filter((m) => (!f.salespersonType || m.salespersonType === f.salespersonType) && (!q || m.displayName.toLowerCase().includes(q)))
      .sort((a, b) => a.invitedAt.localeCompare(b.invitedAt) || a.id.localeCompare(b.id));
    const start = f.cursor ? Number(decodeCursor(f.cursor).offset ?? 0) : 0;
    const items = all.slice(start, start + f.limit).map((p) => Member.restore({ ...p }));
    return { items, nextCursor: start + f.limit < all.length ? encodeCursor({ offset: start + f.limit }) : undefined };
  }

  async countSeats(tx: Transaction): Promise<number> {
    return [...this.members.of(tx).values()].filter((m) => m.status !== 'exited').length;
  }

  async countByOrgUnit(tx: Transaction): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const m of this.members.of(tx).values()) if (m.status !== 'exited') counts[m.orgUnitId] = (counts[m.orgUnitId] ?? 0) + 1;
    return counts;
  }

  async save(tx: Transaction, member: Member): Promise<void> {
    const bucket = this.members.of(tx);
    const stored = bucket.get(member.props.id);
    if (stored && stored.version !== member.props.version) throw new PreconditionFailedError('version_mismatch', 'The member was changed by someone else; reload and retry');
    if (!stored && [...bucket.values()].some((m) => m.contactHash === member.props.contactHash && m.status !== 'exited')) {
      throw new ConflictError('member_exists', 'A member with this contact already exists in this tenant');
    }
    bucket.set(member.props.id, { ...member.props, version: member.props.version + 1 });
    member.markSaved();
  }
}

export class InMemoryChecklistRepository implements ChecklistRepository {
  private readonly lists = new TenantBuckets<Map<string, ChecklistItem[]>>(() => new Map());

  async get(tx: Transaction, memberId: string): Promise<OnboardingChecklist | undefined> {
    const items = this.lists.of(tx).get(memberId);
    return items && OnboardingChecklist.restore(items.map((i) => ({ ...i })));
  }

  async save(tx: Transaction, memberId: string, checklist: OnboardingChecklist): Promise<void> {
    this.lists.of(tx).set(memberId, checklist.items().map((i) => ({ ...i })));
  }
}

export class InMemoryLicenceRepository implements LicenceRepository {
  private readonly licences = new TenantBuckets<Map<string, Licence>>(() => new Map());
  private readonly alerts = new TenantBuckets<Map<string, number[]>>(() => new Map());

  async listForMember(tx: Transaction, memberId: string): Promise<Licence[]> {
    return [...this.licences.of(tx).values()].filter((l) => l.memberId === memberId).map((l) => ({ ...l }));
  }

  async save(tx: Transaction, licence: Licence): Promise<void> {
    this.licences.of(tx).set(licence.id, { ...licence });
  }

  async all(tx: Transaction): Promise<Licence[]> {
    return [...this.licences.of(tx).values()].map((l) => ({ ...l }));
  }

  async alertedThresholds(tx: Transaction, licenceId: string): Promise<number[]> {
    return [...(this.alerts.of(tx).get(licenceId) ?? [])];
  }

  async recordAlert(tx: Transaction, licenceId: string, threshold: number): Promise<void> {
    const bucket = this.alerts.of(tx);
    bucket.set(licenceId, [...(bucket.get(licenceId) ?? []), threshold]);
  }
}

export class InMemoryInsurerCodeRepository implements InsurerCodeRepository {
  private readonly codes = new TenantBuckets<Array<{ memberId: string; insurerId: string; code: string }>>(() => []);

  async list(tx: Transaction, memberId: string): Promise<Array<{ insurerId: string; code: string }>> {
    return this.codes.of(tx).filter((c) => c.memberId === memberId).map(({ insurerId, code }) => ({ insurerId, code }));
  }

  async put(tx: Transaction, memberId: string, insurerId: string, code: string): Promise<void> {
    const bucket = this.codes.of(tx);
    if (bucket.some((c) => c.insurerId === insurerId && c.code === code && c.memberId !== memberId)) {
      throw new ConflictError('insurer_code_taken', 'This insurer code is already assigned to another member');
    }
    const rest = bucket.filter((c) => !(c.memberId === memberId && c.insurerId === insurerId));
    bucket.splice(0, bucket.length, ...rest, { memberId, insurerId, code });
  }
}

export class InMemoryLeaveRepository implements LeaveRepository {
  private readonly leaves = new TenantBuckets<Array<{ memberId: string; from: string; to: string }>>(() => []);

  async isOnLeave(tx: Transaction, memberId: string, at: Date): Promise<boolean> {
    const day = at.toISOString().slice(0, 10);
    return this.leaves.of(tx).some((l) => l.memberId === memberId && l.from <= day && day <= l.to);
  }

  async add(tx: Transaction, memberId: string, from: string, to: string): Promise<void> {
    this.leaves.of(tx).push({ memberId, from, to });
  }
}

export class InMemoryRoleRepository implements RoleRepository {
  private readonly overrides = new TenantBuckets<Map<string, RoleDefinition>>(() => new Map());

  async catalogue(tx: Transaction): Promise<RoleCatalogue> {
    return RoleCatalogue.defaults().withOverrides([...this.overrides.of(tx).values()]);
  }

  async save(tx: Transaction, def: RoleDefinition): Promise<void> {
    this.overrides.of(tx).set(def.role, { ...def, permissions: [...def.permissions] });
  }
}
