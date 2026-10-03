import { PhoneNumber } from '../../src/kernel/domain';
import { Transaction } from '../../src/kernel/persistence/unit-of-work';
import { Member } from '../../src/modules/distribution/domain/member';
import { OrgUnit } from '../../src/modules/distribution/domain/org-unit';
import { OnboardingChecklist } from '../../src/modules/distribution/domain/onboarding';
import { Licence } from '../../src/modules/distribution/domain/licence';
import { RoleCatalogue } from '../../src/modules/distribution/domain/roles';
import {
  ChecklistRepository, InsurerCodeRepository, LeaveRepository, LicenceRepository, MemberFilter, MemberRepository, OrgUnitRepository, ROOT_ORG_UNIT_ID, RoleRepository,
} from '../../src/modules/distribution/application/ports';

export interface DistributionRepos {
  orgUnits: OrgUnitRepository;
  members: MemberRepository;
  checklists: ChecklistRepository;
  licences: LicenceRepository;
  insurerCodes: InsurerCodeRepository;
  leaves: LeaveRepository;
  roles: RoleRepository;
}

export type RunInTenant = <T>(tenantId: string, work: (tx: Transaction) => Promise<T>) => Promise<T>;

/** The behaviour every M02 repository adapter (in-memory and Postgres) must share. */
export function describeDistributionRepositories(name: string, makeRepos: () => DistributionRepos, runInTenant: RunInTenant): void {
  describe(`AC-M02-14 distribution repositories: ${name}`, () => {
    const repos = makeRepos();
    const s = Date.now().toString(36);
    const A = `ten_ca_${s}`;
    const B = `ten_cb_${s}`;
    const C = `ten_cc_${s}`;
    const inA = <T>(work: (tx: Transaction) => Promise<T>) => runInTenant(A, work);
    const inB = <T>(work: (tx: Transaction) => Promise<T>) => runInTenant(B, work);
    const at = (iso: string) => new Date(iso);
    const mid = (id: string) => `${id}_${s}`;
    let phoneSeq = 0;

    const invite = (id: string, over: { roles?: string[]; salespersonType?: 'POSP' | 'EMPLOYEE' | 'ISP' | 'SOLO'; orgUnitId?: string; now?: string; name?: string; phone?: string } = {}) =>
      Member.invite({
        id: mid(id), displayName: over.name ?? `Member ${id}`, phone: PhoneNumber.parse(over.phone ?? `+9198${String(70000000 + (phoneSeq += 1) * 7)}`),
        roles: over.roles ?? ['OPS'], salespersonType: over.salespersonType, orgUnitId: over.orgUnitId ?? ROOT_ORG_UNIT_ID, now: at(over.now ?? '2026-10-01T05:00:00.000Z'),
      });

    it('AC-M02-01 a fresh tenant tree is just the head-office root; children round-trip regardless of save order and stay tenant-private', async () => {
      expect((await inA((tx) => repos.orgUnits.tree(tx))).toNested()).toEqual([{ id: ROOT_ORG_UNIT_ID, kind: 'HEAD_OFFICE', name: 'Head office', territoryCodes: [] }]);
      const branch: OrgUnit = { id: `br_${s}`, parentId: `rg_${s}`, kind: 'BRANCH', name: 'Pune', territoryCodes: ['411', '412'] };
      const region: OrgUnit = { id: `rg_${s}`, parentId: ROOT_ORG_UNIT_ID, kind: 'REGION', name: 'West', territoryCodes: [] };
      await inA((tx) => repos.orgUnits.saveAll(tx, [branch, region]));
      const tree = await inA((tx) => repos.orgUnits.tree(tx));
      expect(tree.get(branch.id)).toEqual(branch);
      expect(tree.get(region.id)).toEqual(region);
      expect(tree.subtreeIds(ROOT_ORG_UNIT_ID).sort()).toEqual([ROOT_ORG_UNIT_ID, branch.id, region.id].sort());
      await inA((tx) => repos.orgUnits.save(tx, { ...branch, name: 'Pune East', territoryCodes: ['411'] }));
      expect((await inA((tx) => repos.orgUnits.tree(tx))).get(branch.id)).toEqual({ ...branch, name: 'Pune East', territoryCodes: ['411'] });
      expect((await inB((tx) => repos.orgUnits.tree(tx))).subtreeIds(ROOT_ORG_UNIT_ID)).toEqual([ROOT_ORG_UNIT_ID]);
    });

    it('AC-M02-02 a member round-trips with its stored version and is invisible to another tenant', async () => {
      const member = invite('m_rt', { roles: ['SALESPERSON'], salespersonType: 'POSP', name: 'Asha Verma' });
      const expected = { ...member.props, roles: [...member.props.roles] };
      await inA((tx) => repos.members.save(tx, member));
      expect(member.props.version).toBe(2);
      const loaded = await inA((tx) => repos.members.get(tx, mid('m_rt')));
      expect(loaded?.props).toEqual({ ...expected, version: 2 });
      expect(await inB((tx) => repos.members.get(tx, mid('m_rt')))).toBeUndefined();
      expect(await inA((tx) => repos.members.get(tx, mid('m_missing')))).toBeUndefined();
      expect((await inA((tx) => repos.members.findByContactHash(tx, expected.contactHash)))?.props.id).toBe(mid('m_rt'));
      expect(await inB((tx) => repos.members.findByContactHash(tx, expected.contactHash))).toBeUndefined();
    });

    it('AC-M02-02 saving a stale aggregate fails with version_mismatch; a fresh load saves and advances the version', async () => {
      await inA((tx) => repos.members.save(tx, invite('m_ver')));
      const first = await inA((tx) => repos.members.get(tx, mid('m_ver')));
      const second = await inA((tx) => repos.members.get(tx, mid('m_ver')));
      if (!first || !second) throw new Error('member missing');
      first.acceptInvite('user_ver', at('2026-10-02T05:00:00.000Z'));
      await inA((tx) => repos.members.save(tx, first));
      expect(first.props.version).toBe(3);
      second.changeRoles(['OPS', 'COMPLIANCE']);
      await expect(inA((tx) => repos.members.save(tx, second))).rejects.toMatchObject({ code: 'version_mismatch' });
      const stored = await inA((tx) => repos.members.get(tx, mid('m_ver')));
      expect(stored?.props).toMatchObject({ status: 'active', userRef: 'user_ver', roles: ['OPS'], version: 3, activatedAt: '2026-10-02T05:00:00.000Z' });
      expect((await inA((tx) => repos.members.findByUserRef(tx, 'user_ver')))?.props.id).toBe(mid('m_ver'));
      expect(await inB((tx) => repos.members.findByUserRef(tx, 'user_ver'))).toBeUndefined();
    });

    it('AC-M02-05 a second active member with the same contact is refused (member_exists); an exited contact and another tenant may reuse it', async () => {
      const phone = '+919811122233';
      await inA((tx) => repos.members.save(tx, invite('m_dup1', { phone })));
      await expect(inA((tx) => repos.members.save(tx, invite('m_dup2', { phone })))).rejects.toMatchObject({ code: 'member_exists' });
      expect(await inA((tx) => repos.members.get(tx, mid('m_dup2')))).toBeUndefined();
      await runInTenant(C, async (tx) => {
        await repos.orgUnits.tree(tx); // seeds the tenant's head-office root, which members reference
        await repos.members.save(tx, invite('m_dup_c', { phone }));
      });
      const first = await inA((tx) => repos.members.get(tx, mid('m_dup1')));
      if (!first) throw new Error('member missing');
      first.exit(at('2026-10-02T05:00:00.000Z'));
      await inA((tx) => repos.members.save(tx, first));
      expect(await inA((tx) => repos.members.findByContactHash(tx, first.props.contactHash))).toBeUndefined();
      await inA((tx) => repos.members.save(tx, invite('m_dup3', { phone })));
      expect((await inA((tx) => repos.members.get(tx, mid('m_dup1'))))?.props).toMatchObject({ status: 'exited', exitedAt: '2026-10-02T05:00:00.000Z' });
    });

    it('AC-M02-10 member lists filter, order by invitation time then id, and page with a cursor', async () => {
      const unit: OrgUnit = { id: `tm_${s}`, parentId: ROOT_ORG_UNIT_ID, kind: 'TEAM', name: 'Team', territoryCodes: [] };
      await inB((tx) => repos.orgUnits.save(tx, unit));
      const seed = [
        invite('l_c', { now: '2026-10-01T09:00:00.000Z', name: 'Chandra Rao', orgUnitId: unit.id }),
        invite('l_b', { now: '2026-10-01T08:00:00.000Z', name: 'Bela Shah', roles: ['SALESPERSON'], salespersonType: 'ISP', orgUnitId: unit.id }),
        invite('l_a2', { now: '2026-10-01T08:00:00.000Z', name: 'Anil Bose' }),
        invite('l_a1', { now: '2026-10-01T08:00:00.000Z', name: 'anita nair', roles: ['SALESPERSON', 'COMPLIANCE'], salespersonType: 'POSP' }),
      ];
      for (const m of seed) await inB((tx) => repos.members.save(tx, m));
      const ex = invite('l_x', { now: '2026-10-01T07:00:00.000Z', name: 'Exit Er' });
      await inB((tx) => repos.members.save(tx, ex));
      ex.exit(at('2026-10-02T00:00:00.000Z'));
      await inB((tx) => repos.members.save(tx, ex));
      const ids = async (f: Partial<MemberFilter>) => (await inB((tx) => repos.members.list(tx, { limit: 50, ...f }))).items.map((m) => m.props.id);
      const order = [mid('l_x'), mid('l_a1'), mid('l_a2'), mid('l_b'), mid('l_c')];
      expect(await ids({})).toEqual(order);
      expect(await ids({ status: 'invited' })).toEqual(order.slice(1));
      expect(await ids({ status: 'exited' })).toEqual([mid('l_x')]);
      expect(await ids({ role: 'COMPLIANCE' })).toEqual([mid('l_a1')]);
      expect(await ids({ orgUnitIds: [unit.id] })).toEqual([mid('l_b'), mid('l_c')]);
      expect(await ids({ orgUnitIds: [] })).toEqual([]);
      expect(await ids({ memberId: mid('l_b') })).toEqual([mid('l_b')]);
      expect(await ids({ salespersonType: 'POSP' })).toEqual([mid('l_a1')]);
      expect(await ids({ q: 'ANI' })).toEqual([mid('l_a1'), mid('l_a2')]);
      expect(await ids({ q: '%' })).toEqual([]);
      expect(await ids({ status: 'invited', salespersonType: 'ISP', orgUnitIds: [unit.id], q: 'bela' })).toEqual([mid('l_b')]);
      const page1 = await inB((tx) => repos.members.list(tx, { limit: 2 }));
      expect(page1.items.map((m) => m.props.id)).toEqual(order.slice(0, 2));
      expect(page1.nextCursor).toEqual(expect.any(String));
      const page2 = await inB((tx) => repos.members.list(tx, { limit: 2, cursor: page1.nextCursor }));
      expect(page2.items.map((m) => m.props.id)).toEqual(order.slice(2, 4));
      const page3 = await inB((tx) => repos.members.list(tx, { limit: 2, cursor: page2.nextCursor }));
      expect(page3.items.map((m) => m.props.id)).toEqual(order.slice(4));
      expect(page3.nextCursor).toBeUndefined();
      expect(await inA((tx) => repos.members.list(tx, { limit: 50, q: 'Chandra' }))).toEqual({ items: [], nextCursor: undefined });
    });

    it('AC-M02-05 seat and per-unit counts exclude exited members and are tenant-scoped', async () => {
      const unit = `tm_${s}`;
      expect(await inB((tx) => repos.members.countSeats(tx))).toBe(4);
      expect(await inB((tx) => repos.members.countByOrgUnit(tx))).toEqual({ [ROOT_ORG_UNIT_ID]: 2, [unit]: 2 });
      expect((await inA((tx) => repos.members.countByOrgUnit(tx)))[unit]).toBeUndefined();
    });

    it('AC-M02-03 a checklist round-trips item for item and is replaced on save', async () => {
      await inA((tx) => repos.members.save(tx, invite('m_chk', { roles: ['SALESPERSON'], salespersonType: 'POSP' })));
      expect(await inA((tx) => repos.checklists.get(tx, mid('m_chk')))).toBeUndefined();
      const checklist = OnboardingChecklist.for('POSP');
      checklist.recordEvidence('IDENTITY_PAN', { evidenceRef: 'ev_pan', note: 'verified' }, at('2026-10-02T05:00:00.000Z'));
      await inA((tx) => repos.checklists.save(tx, mid('m_chk'), checklist));
      expect((await inA((tx) => repos.checklists.get(tx, mid('m_chk'))))?.items()).toEqual(checklist.items());
      checklist.logTraining(15, 'ev_tr', at('2026-10-03T05:00:00.000Z'));
      await inA((tx) => repos.checklists.save(tx, mid('m_chk'), checklist));
      const reloaded = await inA((tx) => repos.checklists.get(tx, mid('m_chk')));
      expect(reloaded?.items()).toEqual(checklist.items());
      expect(reloaded?.missing()).toEqual(checklist.missing());
      expect(await inB((tx) => repos.checklists.get(tx, mid('m_chk')))).toBeUndefined();
    });

    it('AC-M02-09 licences round-trip with date-only fields, list per member in save order, upsert by id and stay tenant-private', async () => {
      await inA((tx) => repos.members.save(tx, invite('m_lic')));
      await inA((tx) => repos.members.save(tx, invite('m_lic2')));
      const l1: Licence = { id: `lic1_${s}`, memberId: mid('m_lic'), kind: 'POSP_LIFE', number: 'P-1', validFrom: '2026-01-01', validTo: '2026-12-31' };
      const l2: Licence = { id: `lic2_${s}`, memberId: mid('m_lic'), kind: 'ISP', number: 'I-2', validFrom: '2025-04-01', validTo: '2027-03-31', verifiedAt: '2026-10-01T05:30:00.000Z' };
      const l3: Licence = { id: `lic3_${s}`, memberId: mid('m_lic2'), kind: 'OTHER', number: 'O-3', validFrom: '2026-02-01', validTo: '2026-02-01' };
      for (const l of [l1, l2, l3]) await inA((tx) => repos.licences.save(tx, l));
      expect(await inA((tx) => repos.licences.listForMember(tx, mid('m_lic')))).toEqual([l1, l2]);
      await inA((tx) => repos.licences.save(tx, { ...l1, number: 'P-1b', verifiedAt: '2026-10-02T00:00:00.000Z' }));
      expect(await inA((tx) => repos.licences.listForMember(tx, mid('m_lic')))).toEqual([{ ...l1, number: 'P-1b', verifiedAt: '2026-10-02T00:00:00.000Z' }, l2]);
      expect((await inA((tx) => repos.licences.all(tx))).map((l) => l.id)).toEqual([l1.id, l2.id, l3.id]);
      expect(await inB((tx) => repos.licences.all(tx))).toEqual([]);
      expect(await inB((tx) => repos.licences.listForMember(tx, mid('m_lic')))).toEqual([]);
    });

    it('AC-M02-08 licence alerts are remembered per licence in the order recorded', async () => {
      const id = `lic1_${s}`;
      expect(await inA((tx) => repos.licences.alertedThresholds(tx, id))).toEqual([]);
      await inA((tx) => repos.licences.recordAlert(tx, id, 60));
      await inA((tx) => repos.licences.recordAlert(tx, id, 30));
      expect(await inA((tx) => repos.licences.alertedThresholds(tx, id))).toEqual([60, 30]);
      expect(await inA((tx) => repos.licences.alertedThresholds(tx, `lic2_${s}`))).toEqual([]);
      expect(await inB((tx) => repos.licences.alertedThresholds(tx, id))).toEqual([]);
    });

    it('AC-M02-05 insurer codes list in assignment order, re-assign per insurer, and a code is unique per insurer within the tenant', async () => {
      await inA((tx) => repos.members.save(tx, invite('m_ic1')));
      await inA((tx) => repos.members.save(tx, invite('m_ic2')));
      await inA((tx) => repos.insurerCodes.put(tx, mid('m_ic1'), 'ins_a', 'AG-1'));
      await inA((tx) => repos.insurerCodes.put(tx, mid('m_ic1'), 'ins_b', 'BG-1'));
      expect(await inA((tx) => repos.insurerCodes.list(tx, mid('m_ic1')))).toEqual([{ insurerId: 'ins_a', code: 'AG-1' }, { insurerId: 'ins_b', code: 'BG-1' }]);
      await inA((tx) => repos.insurerCodes.put(tx, mid('m_ic1'), 'ins_a', 'AG-1'));
      await inA((tx) => repos.insurerCodes.put(tx, mid('m_ic1'), 'ins_a', 'AG-2'));
      expect(await inA((tx) => repos.insurerCodes.list(tx, mid('m_ic1')))).toEqual([{ insurerId: 'ins_b', code: 'BG-1' }, { insurerId: 'ins_a', code: 'AG-2' }]);
      await expect(inA((tx) => repos.insurerCodes.put(tx, mid('m_ic2'), 'ins_a', 'AG-2'))).rejects.toMatchObject({ code: 'insurer_code_taken' });
      await inA((tx) => repos.insurerCodes.put(tx, mid('m_ic2'), 'ins_b', 'AG-2'));
      await inA((tx) => repos.insurerCodes.put(tx, mid('m_ic2'), 'ins_a', 'AG-1'));
      expect(await inA((tx) => repos.insurerCodes.list(tx, mid('m_ic2')))).toEqual([{ insurerId: 'ins_b', code: 'AG-2' }, { insurerId: 'ins_a', code: 'AG-1' }]);
      expect(await inB((tx) => repos.insurerCodes.list(tx, mid('m_ic1')))).toEqual([]);
    });

    it('AC-M02-09 leave covers its inclusive date range (IST day of the instant) and is tenant-private', async () => {
      await inA((tx) => repos.members.save(tx, invite('m_lv')));
      const on = (iso: string) => inA((tx) => repos.leaves.isOnLeave(tx, mid('m_lv'), at(iso)));
      expect(await on('2026-10-10T12:00:00.000Z')).toBe(false);
      await inA((tx) => repos.leaves.add(tx, mid('m_lv'), '2026-10-10', '2026-10-12'));
      // IST midnight is 18:30Z the day before: leave runs 10 Oct 00:00 IST to 12 Oct 23:59:59 IST.
      expect(await on('2026-10-09T18:29:59.000Z')).toBe(false);
      expect(await on('2026-10-09T18:30:00.000Z')).toBe(true);
      expect(await on('2026-10-12T18:29:59.000Z')).toBe(true);
      expect(await on('2026-10-12T18:30:00.000Z')).toBe(false);
      await inA((tx) => repos.leaves.add(tx, mid('m_lv'), '2026-10-20', '2026-10-20'));
      expect(await on('2026-10-20T10:00:00.000Z')).toBe(true);
      expect(await inB((tx) => repos.leaves.isOnLeave(tx, mid('m_lv'), at('2026-10-11T00:00:00.000Z')))).toBe(false);
    });

    it('AC-M02-11 the role catalogue is the defaults until a tenant saves a role; saves are versioned per tenant', async () => {
      const defaults = RoleCatalogue.defaults();
      expect((await inA((tx) => repos.roles.catalogue(tx))).list()).toEqual(defaults.list());
      const widened = [...defaults.get('BRANCH_MANAGER').permissions, 'distribution.role.read'];
      await inA((tx) => repos.roles.save(tx, defaults.withPermissions('BRANCH_MANAGER', widened).get('BRANCH_MANAGER')));
      const stored = await inA((tx) => repos.roles.catalogue(tx));
      expect(stored.get('BRANCH_MANAGER')).toEqual({ ...defaults.get('BRANCH_MANAGER'), version: 2, permissions: widened });
      expect(stored.get('TENANT_ADMIN')).toEqual(defaults.get('TENANT_ADMIN'));
      expect(stored.list().map((r) => r.role)).toEqual(defaults.list().map((r) => r.role));
      await inA((tx) => repos.roles.save(tx, stored.withPermissions('BRANCH_MANAGER', ['distribution.member.read']).get('BRANCH_MANAGER')));
      expect((await inA((tx) => repos.roles.catalogue(tx))).get('BRANCH_MANAGER')).toMatchObject({ version: 3, permissions: ['distribution.member.read'] });
      expect((await inB((tx) => repos.roles.catalogue(tx))).get('BRANCH_MANAGER')).toEqual(defaults.get('BRANCH_MANAGER'));
    });
  });
}
