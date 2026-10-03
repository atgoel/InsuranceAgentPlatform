import { PhoneNumber } from '../../src/kernel/domain';
import { Transaction } from '../../src/kernel/persistence/unit-of-work';
import { Member } from '../../src/modules/distribution/domain/member';
import {
  InMemoryInsurerCodeRepository, InMemoryLeaveRepository, InMemoryLicenceRepository, InMemoryMemberRepository, InMemoryOrgUnitRepository,
} from '../../src/modules/distribution/infrastructure/in-memory-distribution.repositories';
import { SellerDirectoryService } from '../../src/modules/distribution/application/seller-directory';

/** AC-M02-09: selling scope and routing eligibility derive from type, licences, leave and language. */
describe('AC-M02-09 SellerDirectoryService', () => {
  const tx: Transaction = { tenantId: 'ten_acme', kind: 'memory' };
  const now = new Date('2026-10-03T09:00:00Z');
  let members: InMemoryMemberRepository;
  let licences: InMemoryLicenceRepository;
  let leaves: InMemoryLeaveRepository;
  let codes: InMemoryInsurerCodeRepository;
  let directory: SellerDirectoryService;
  let units: InMemoryOrgUnitRepository;

  async function activeSeller(id: string, type: 'POSP' | 'EMPLOYEE', phone: string, languages: string[] = ['en']): Promise<Member> {
    const m = Member.invite({ id, displayName: `Seller ${id}`, phone: PhoneNumber.parse(phone), roles: ['SALESPERSON'], salespersonType: type, orgUnitId: 'ou_root', now });
    m.acceptInvite(`user_${id}`, now);
    m.activate(now, { isComplete: () => true, missing: () => [] });
    const active = Member.restore({ ...m.props, languages });
    await members.save(tx, active);
    return active;
  }

  beforeEach(() => {
    members = new InMemoryMemberRepository();
    licences = new InMemoryLicenceRepository();
    leaves = new InMemoryLeaveRepository();
    codes = new InMemoryInsurerCodeRepository();
    units = new InMemoryOrgUnitRepository();
    directory = new SellerDirectoryService(members, licences, leaves, codes, units);
  });

  it('gives a POSP only the lines covered by a currently valid licence, and marks posEligibleOnly', async () => {
    await activeSeller('mem_p', 'POSP', '9876500001');
    await licences.save(tx, { id: 'lic_1', memberId: 'mem_p', kind: 'POSP_LIFE', number: 'L-001', validFrom: '2026-01-01', validTo: '2027-01-01' });
    await licences.save(tx, { id: 'lic_2', memberId: 'mem_p', kind: 'POSP_GENERAL', number: 'G-001', validFrom: '2025-01-01', validTo: '2026-06-30' });
    await codes.put(tx, 'mem_p', 'ins_hdfc', 'HD-77');

    const scope = await directory.sellingScope(tx, 'mem_p', now);

    expect(scope).toEqual({ memberId: 'mem_p', salespersonType: 'POSP', posEligibleOnly: true, lines: ['LIFE'], insurerCodes: { ins_hdfc: 'HD-77' } });
  });

  it('gives an employee every line without licence checks', async () => {
    await activeSeller('mem_e', 'EMPLOYEE', '9876500002');
    const scope = await directory.sellingScope(tx, 'mem_e', now);
    expect(scope?.lines).toEqual(['LIFE', 'HEALTH', 'GENERAL']);
    expect(scope?.posEligibleOnly).toBe(false);
  });

  it('has no selling scope for a member who is not active', async () => {
    const invited = Member.invite({ id: 'mem_i', displayName: 'Invitee', phone: PhoneNumber.parse('9876500003'), roles: ['SALESPERSON'], salespersonType: 'EMPLOYEE', orgUnitId: 'ou_root', now });
    await members.save(tx, invited);
    expect(await directory.sellingScope(tx, 'mem_i', now)).toBeUndefined();
    expect(await directory.sellingScope(tx, 'mem_unknown', now)).toBeUndefined();
  });

  it('excludes sellers on leave, without the language, or unlicensed for the line', async () => {
    await activeSeller('mem_ok', 'EMPLOYEE', '9876500004', ['en', 'hi']);
    await activeSeller('mem_leave', 'EMPLOYEE', '9876500005', ['en', 'hi']);
    await activeSeller('mem_lang', 'EMPLOYEE', '9876500006', ['ta']);
    await activeSeller('mem_posp', 'POSP', '9876500007', ['hi']);
    await leaves.add(tx, 'mem_leave', '2026-10-01', '2026-10-05');

    const sellers = await directory.eligibleSellers(tx, { line: 'HEALTH', language: 'hi', at: now });

    expect(sellers.map((s) => s.memberId)).toEqual(['mem_ok']);
  });

  it('excludes POSP sellers when the product is not POS-eligible', async () => {
    await activeSeller('mem_posp', 'POSP', '9876500008');
    await licences.save(tx, { id: 'lic_3', memberId: 'mem_posp', kind: 'POSP_LIFE', number: 'L-002', validFrom: '2026-01-01', validTo: '2027-01-01' });
    expect(await directory.eligibleSellers(tx, { line: 'LIFE', posEligibleProduct: false, at: now })).toEqual([]);
    expect((await directory.eligibleSellers(tx, { line: 'LIFE', posEligibleProduct: true, at: now })).map((s) => s.memberId)).toEqual(['mem_posp']);
  });

  it('keeps tenants apart', async () => {
    await activeSeller('mem_e', 'EMPLOYEE', '9876500009');
    expect(await directory.sellingScope({ tenantId: 'ten_zen', kind: 'memory' }, 'mem_e', now)).toBeUndefined();
  });

  it('AC-M02-09 limits a pool to an org-unit subtree and carries the unit territory codes', async () => {
    await units.save(tx, { id: 'ou_pune', parentId: 'ou_root', kind: 'BRANCH', name: 'Pune', territoryCodes: ['411', '412'] });
    await units.save(tx, { id: 'ou_pune_t1', parentId: 'ou_pune', kind: 'TEAM', name: 'Pune T1', territoryCodes: ['4110'] });
    await units.save(tx, { id: 'ou_nagpur', parentId: 'ou_root', kind: 'BRANCH', name: 'Nagpur', territoryCodes: ['440'] });
    const place = async (id: string, phone: string, orgUnitId: string) => members.save(tx, Member.restore({ ...(await activeSeller(id, 'EMPLOYEE', phone)).props, orgUnitId }));
    await place('mem_p', '9876500101', 'ou_pune');
    await place('mem_t', '9876500102', 'ou_pune_t1');
    await place('mem_n', '9876500103', 'ou_nagpur');

    const pool = await directory.eligibleSellers(tx, { withinOrgUnitId: 'ou_pune', at: now });

    expect(pool.map((s) => [s.memberId, s.territoryCodes])).toEqual([['mem_p', ['411', '412']], ['mem_t', ['4110']]]);
  });
});
