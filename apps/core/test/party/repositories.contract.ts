import { Transaction } from '../../src/kernel/persistence/unit-of-work';
import { AesGcmFieldCipher } from '../../src/kernel/crypto/aes-gcm-field-cipher';
import { Party } from '../../src/modules/party/domain/party';
import { ContactPoint } from '../../src/modules/party/domain/contact-point';
import { ConsentRecord } from '../../src/modules/party/domain/consent';
import { Household } from '../../src/modules/party/domain/household';
import { MergeRecord } from '../../src/modules/party/domain/merge';
import { PartyRoleLink } from '../../src/modules/party/domain/party-role';
import { Suppression } from '../../src/modules/party/domain/suppression';
import {
  ConsentRepository, DuplicateCandidate, DuplicateRepository, HouseholdRepository, PartyRepository, RoleLinkRepository, SuppressionRepository,
} from '../../src/modules/party/application/ports';

export interface PartyRepositories {
  party: PartyRepository;
  consent: ConsentRepository;
  suppression: SuppressionRepository;
  household: HouseholdRepository;
  roleLinks: RoleLinkRepository;
  duplicates: DuplicateRepository;
}

export interface ContractHarness {
  repos: PartyRepositories;
  /** Runs `work` in one transaction for the tenant (committed on success). */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  tenantA: string;
  tenantB: string;
  /** Unique per run: every id and hash below is suffixed with it. */
  suffix: string;
}

export const contractCipher = new AesGcmFieldCipher(Buffer.alloc(32, 9));
const T0 = Date.parse('2026-10-01T00:00:00.000Z');
const at = (minutes: number): string => new Date(T0 + minutes * 60_000).toISOString();

/**
 * The observable behaviour every M03 repository adapter must have (in-memory and Postgres run the same cases).
 * `setup` is called once; the harness is shared by all cases, so each case uses its own ids.
 */
export function partyRepositoriesContract(label: string, setup: () => Promise<ContractHarness>, teardown?: () => Promise<void>): void {
  describe(`${label} (AC-M03 repository contract)`, () => {
    let h: ContractHarness;
    let seq = 0;
    beforeAll(async () => { h = await setup(); });
    if (teardown) afterAll(teardown);

    const id = (prefix: string, key: string) => `${prefix}_${h.suffix}_${key}`;
    const cp = (key: string, channel: ContactPoint['channel'] = 'MOBILE', isPrimary = true): ContactPoint => ({
      channel, valueEnc: `enc-${key}`, valueHash: `hash_${h.suffix}_${key}`, masked: `masked-${key}`, isPrimary,
    });
    const mk = (key: string, name: string, extra: { contacts?: ContactPoint[]; tags?: string[]; ownerMemberId?: string; orgUnitId?: string } = {}): Party =>
      Party.create({
        id: id('pty', key), kind: 'PERSON', displayName: name, contactPoints: extra.contacts ?? [cp(key)], tags: extra.tags,
        ownerMemberId: extra.ownerMemberId, orgUnitId: extra.orgUnitId, source: { kind: 'MANUAL' }, now: new Date(T0 + seq++ * 60_000),
      });
    const A = () => h.tenantA;
    const B = () => h.tenantB;
    const save = (tenant: string, ...parties: Party[]) => h.run(tenant, async (tx) => { for (const p of parties) await h.repos.party.save(tx, p); });
    const get = (tenant: string, partyId: string) => h.run(tenant, (tx) => h.repos.party.get(tx, partyId));
    const must = <T>(v: T | undefined): T => { if (v === undefined) throw new Error('expected a value'); return v; };

    it('AC-M03-01 a party round-trips with encrypted P3 fields, contact points and a bumped version', async () => {
      const p = mk('rt', 'Asha Rao', { tags: ['vip', 'renewal'], ownerMemberId: 'mem_1', orgUnitId: 'ou_1', contacts: [cp('rt'), cp('rt-mail', 'EMAIL')] });
      const dobEnc = await contractCipher.encrypt(A(), '1988-04-12');
      const panEnc = await contractCipher.encrypt(A(), 'ABCDE1234F');
      p.setSensitive({ dateOfBirthEnc: dobEnc, dobYear: 1988, birthday: '04-12', panEnc, panHash: contractCipher.hash(A(), 'ABCDE1234F'), panLast4: '234F' });
      p.setSensitiveField('preferredChannel', 'WHATSAPP');
      await save(A(), p);
      expect(p.props.version).toBe(2);

      const got = must(await get(A(), id('pty', 'rt')));
      expect(got.props).toEqual(p.props);
      expect(got.props.panEnc).not.toContain('ABCDE1234F');
      expect(got.props.dateOfBirthEnc).not.toContain('1988-04-12');
      expect(await contractCipher.decrypt(A(), must(got.props.panEnc))).toBe('ABCDE1234F');
      expect(got.props.contactPoints.map((c) => [c.channel, c.valueHash, c.isPrimary])).toEqual([
        ['MOBILE', `hash_${h.suffix}_rt`, true], ['EMAIL', `hash_${h.suffix}_rt-mail`, true],
      ]);
      expect(await get(A(), id('pty', 'missing'))).toBeUndefined();
    });


    it('AC-CR001-08 custom_fields round-trip, are replaced on save and stay tenant-isolated', async () => {
      const p = Party.create({
        id: id('pty', 'cf'), kind: 'PERSON', displayName: 'Meera Nair', contactPoints: [cp('cf')], source: { kind: 'MANUAL' }, now: new Date(T0),
        customFields: { occupation: 'Architect', income_paise: 90_000_000, nri: false },
      });
      await save(A(), p);
      expect(must(await get(A(), id('pty', 'cf'))).props.customFields).toEqual({ occupation: 'Architect', income_paise: 90_000_000, nri: false });
      const loaded = must(await get(A(), id('pty', 'cf')));
      loaded.replaceCustomFields({ occupation: 'Doctor' }, new Date(T0 + 60_000));
      await save(A(), loaded);
      const again = must(await get(A(), id('pty', 'cf')));
      expect(again.props.customFields).toEqual({ occupation: 'Doctor' });
      expect(again.props.version).toBe(3);
      expect(await get(B(), id('pty', 'cf'))).toBeUndefined();
    });
    it('AC-M03-01 an update replaces fields and contact points and bumps the version again', async () => {
      await save(A(), mk('up', 'Bimal Das'));
      const p = must(await get(A(), id('pty', 'up')));
      p.rename('Bimal K Das', new Date(at(500)));
      p.setContactPoints([cp('up-2'), cp('up-3', 'EMAIL')]);
      p.setTags(['gold']);
      await save(A(), p);
      expect(p.props.version).toBe(3);
      const got = must(await get(A(), id('pty', 'up')));
      expect(got.props).toEqual(p.props);
      expect(got.props.displayName).toBe('Bimal K Das');
      expect(got.props.tags).toEqual(['gold']);
      expect(got.props.contactPoints.map((c) => c.valueHash)).toEqual([`hash_${h.suffix}_up-2`, `hash_${h.suffix}_up-3`]);
    });

    it('AC-M03-02 a stale version is rejected with version_mismatch and leaves the first write intact', async () => {
      await save(A(), mk('vc', 'Chitra Iyer'));
      const first = must(await get(A(), id('pty', 'vc')));
      const second = must(await get(A(), id('pty', 'vc')));
      first.rename('Chitra First', new Date(at(600)));
      await save(A(), first);
      second.rename('Chitra Second', new Date(at(601)));
      await expect(save(A(), second)).rejects.toMatchObject({ code: 'version_mismatch' });
      expect(must(await get(A(), id('pty', 'vc'))).props).toMatchObject({ displayName: 'Chitra First', version: 3 });
    });

    it('AC-M03-03 lookups by contact hash and PAN hash return ACTIVE parties only', async () => {
      const keep = mk('lk1', 'Dev Anand');
      const other = mk('lk2', 'Dev Anand Two', { contacts: [cp('lk1')] });
      const pan = contractCipher.hash(A(), `PAN${h.suffix}`);
      keep.setSensitive({ panHash: pan });
      other.setSensitive({ panHash: pan });
      await save(A(), keep, other);
      const byContact = async () => (await h.run(A(), (tx) => h.repos.party.findByContactHash(tx, `hash_${h.suffix}_lk1`))).map((p) => p.props.id).sort();
      expect(await byContact()).toEqual([id('pty', 'lk1'), id('pty', 'lk2')]);
      const g = must(await get(A(), id('pty', 'lk2')));
      g.markMerged(id('pty', 'lk1'), new Date(at(700)));
      await save(A(), g);
      expect(await byContact()).toEqual([id('pty', 'lk1')]);
      expect((await h.run(A(), (tx) => h.repos.party.findByPanHash(tx, pan))).map((p) => p.props.id)).toEqual([id('pty', 'lk1')]);
      expect(await h.run(A(), (tx) => h.repos.party.findByPanHash(tx, 'nope'))).toEqual([]);
      expect(must(await get(A(), id('pty', 'lk2'))).props).toMatchObject({ status: 'MERGED', mergedIntoId: id('pty', 'lk1') });
    });

    it('AC-M03-04 name search matches the normalised prefix, honours the limit and treats % and _ literally', async () => {
      const u = `zq${h.suffix}`;
      await save(A(), mk('n1', `${u} Ravi Kumar`), mk('n2', `${u} Ravindra Rao`), mk('n3', `${u} Anil Roy`));
      const search = (tenant: string, prefix: string, limit: number) => h.run(tenant, async (tx) => (await h.repos.party.searchByName(tx, prefix, limit)).map((p) => p.props.id));
      expect(await search(A(), `${u} ravi`, 10)).toEqual([id('pty', 'n1'), id('pty', 'n2')]);
      expect(await search(A(), `${u} ravi`, 1)).toEqual([id('pty', 'n1')]);
      expect(await search(A(), `${u} anil`, 10)).toEqual([id('pty', 'n3')]);
      expect(await search(A(), `${u} r_vi`, 10)).toEqual([]);
      expect(await search(A(), '%', 10)).toEqual([]);
      expect(await search(B(), `${u} ravi`, 10)).toEqual([]);
    });

    it('AC-M03-05 list filters by scope, tag and ids, sorts by name and pages with a cursor', async () => {
      const tag = `lst-${h.suffix}`;
      await save(A(),
        mk('l3', 'Chitra Lister', { tags: [tag], ownerMemberId: 'mem_1', orgUnitId: 'ou_2' }),
        mk('l1', 'Asha Lister', { tags: [tag, 'x'], ownerMemberId: 'mem_1', orgUnitId: 'ou_1' }),
        mk('l2', 'Bimal Lister', { tags: [tag], ownerMemberId: 'mem_2', orgUnitId: 'ou_2' }),
        mk('l4', 'Dev Lister', { ownerMemberId: 'mem_1', orgUnitId: 'ou_1' }));
      const names = async (filter: Partial<Parameters<PartyRepository['list']>[1]>) =>
        (await h.run(A(), (tx) => h.repos.party.list(tx, { scope: { kind: 'TENANT' }, limit: 50, ...filter }))).items.map((p) => p.props.displayName);

      expect(await names({ tag })).toEqual(['Asha Lister', 'Bimal Lister', 'Chitra Lister']);
      expect(await names({ tag, scope: { kind: 'OWN', memberId: 'mem_1' } })).toEqual(['Asha Lister', 'Chitra Lister']);
      expect(await names({ tag, scope: { kind: 'OWN' } })).toEqual([]);
      expect(await names({ tag, scope: { kind: 'UNIT_SUBTREE', orgUnitIds: ['ou_2'] } })).toEqual(['Bimal Lister', 'Chitra Lister']);
      expect(await names({ tag, ids: [id('pty', 'l1'), id('pty', 'l2'), id('pty', 'l4')] })).toEqual(['Asha Lister', 'Bimal Lister']);
      expect(await names({ ids: [id('pty', 'l4')] })).toEqual(['Dev Lister']);

      const first = await h.run(A(), (tx) => h.repos.party.list(tx, { scope: { kind: 'TENANT' }, tag, limit: 2 }));
      expect(first.items.map((p) => p.props.displayName)).toEqual(['Asha Lister', 'Bimal Lister']);
      const second = await h.run(A(), (tx) => h.repos.party.list(tx, { scope: { kind: 'TENANT' }, tag, limit: 2, cursor: first.nextCursor }));
      expect(second.items.map((p) => p.props.displayName)).toEqual(['Chitra Lister']);
      expect(second.nextCursor).toBeUndefined();
    });

    it('AC-M03-06 consent: the ledger is ordered, the latest per purpose and channel wins and ANY applies when newer', async () => {
      await save(A(), mk('cs', 'Consent Person'));
      const rec = (key: string, minutes: number, over: Partial<ConsentRecord>): ConsentRecord => ({
        id: id('cns', key), partyId: id('pty', 'cs'), purpose: 'MARKETING', channel: 'SMS', granted: true, noticeVersion: 'n1', source: 'ASSISTED', capturedBy: 'mem_1',
        occurredAt: at(minutes), ...over,
      });
      await h.run(A(), async (tx) => {
        await h.repos.consent.append(tx, rec('3', 30, { granted: false, noticeVersion: 'n2', evidenceRef: 'ev-3' }));
        await h.repos.consent.append(tx, rec('1', 10, {}));
        await h.repos.consent.append(tx, rec('2', 20, { channel: 'EMAIL', source: 'WEB_FORM' }));
        await h.repos.consent.append(tx, rec('4', 40, { purpose: 'SERVICE', channel: 'ANY' }));
      });
      const ledger = await h.run(A(), (tx) => h.repos.consent.ledger(tx, id('pty', 'cs')));
      expect(ledger.history().map((r) => r.id)).toEqual([id('cns', '1'), id('cns', '2'), id('cns', '3'), id('cns', '4')]);
      expect(ledger.history()[2]).toEqual(rec('3', 30, { granted: false, noticeVersion: 'n2', evidenceRef: 'ev-3' }));
      expect(ledger.history()[0]).toEqual(rec('1', 10, {}));
      expect(ledger.stateFor('MARKETING', 'SMS')).toMatchObject({ granted: false, record: { id: id('cns', '3') } });
      expect(ledger.stateFor('MARKETING', 'EMAIL')).toMatchObject({ granted: true, record: { id: id('cns', '2') } });
      expect(ledger.stateFor('SERVICE', 'CALL')).toMatchObject({ granted: true, record: { id: id('cns', '4') } });
      expect(ledger.stateFor('AI_PROCESSING', 'SMS')).toEqual({ granted: false });
      expect(ledger.summary()).toEqual([
        { purpose: 'MARKETING', channel: 'SMS', granted: false, occurredAt: at(30), noticeVersion: 'n2' },
        { purpose: 'MARKETING', channel: 'EMAIL', granted: true, occurredAt: at(20), noticeVersion: 'n1' },
        { purpose: 'SERVICE', channel: 'ANY', granted: true, occurredAt: at(40), noticeVersion: 'n1' },
      ]);
      expect((await h.run(A(), (tx) => h.repos.consent.ledger(tx, id('pty', 'none')))).history()).toEqual([]);
    });

    it('AC-M03-07 suppression: only windows covering the instant for that contact hash are active', async () => {
      const hash = `hash_${h.suffix}_sup`;
      const s = (key: string, over: Partial<Suppression>): Suppression => ({ id: id('sup', key), contactHash: hash, channel: 'SMS', reason: 'DND', from: at(0), createdBy: 'mem_1', ...over });
      const bounded = s('bounded', { from: at(10), to: at(300), channel: 'ANY', reason: 'COMPLAINT' });
      await h.run(A(), async (tx) => {
        await h.repos.suppression.add(tx, s('open', {}));
        await h.repos.suppression.add(tx, s('expired', { from: at(0), to: at(60), reason: 'BOUNCE' }));
        await h.repos.suppression.add(tx, s('future', { from: at(600), reason: 'OPT_OUT' }));
        await h.repos.suppression.add(tx, bounded);
        await h.repos.suppression.add(tx, s('other', { contactHash: `${hash}-other` }));
      });
      const active = async (minutes: number, tenant = A()) =>
        (await h.run(tenant, (tx) => h.repos.suppression.activeFor(tx, hash, new Date(T0 + minutes * 60_000)))).map((x) => x.id).sort();
      expect(await active(30)).toEqual([id('sup', 'bounded'), id('sup', 'expired'), id('sup', 'open')]);
      expect(await active(60)).toEqual([id('sup', 'bounded'), id('sup', 'open')]);
      expect(await active(100)).toEqual([id('sup', 'bounded'), id('sup', 'open')]);
      expect(await active(700)).toEqual([id('sup', 'future'), id('sup', 'open')]);
      expect(await active(-5)).toEqual([]);
      expect(await active(30, B())).toEqual([]);
      const found = (await h.run(A(), (tx) => h.repos.suppression.activeFor(tx, hash, new Date(T0 + 30 * 60_000)))).find((x) => x.id === bounded.id);
      expect(found).toEqual(bounded);
    });

    it('AC-M03-08 household: save, load by id and by member, membership changes and removal persist in order', async () => {
      await save(A(), mk('hh1', 'Head Person'), mk('hh2', 'Spouse Person'), mk('hh3', 'Child Person'));
      const hh = Household.create({ id: id('hh', '1'), name: 'Person family', head: id('pty', 'hh1') });
      hh.add(id('pty', 'hh2'), 'SPOUSE');
      await h.run(A(), (tx) => h.repos.household.save(tx, hh));
      const got = must(await h.run(A(), (tx) => h.repos.household.get(tx, id('hh', '1'))));
      expect({ id: got.id, name: got.name, head: got.headPartyId, members: got.members }).toEqual({
        id: id('hh', '1'), name: 'Person family', head: id('pty', 'hh1'),
        members: [{ partyId: id('pty', 'hh1'), relation: 'SELF' }, { partyId: id('pty', 'hh2'), relation: 'SPOUSE' }],
      });
      got.add(id('pty', 'hh3'), 'CHILD');
      got.remove(id('pty', 'hh2'));
      await h.run(A(), (tx) => h.repos.household.save(tx, got));
      const byMember = must(await h.run(A(), (tx) => h.repos.household.forParty(tx, id('pty', 'hh3'))));
      expect(byMember.members).toEqual([{ partyId: id('pty', 'hh1'), relation: 'SELF' }, { partyId: id('pty', 'hh3'), relation: 'CHILD' }]);
      expect(await h.run(A(), (tx) => h.repos.household.forParty(tx, id('pty', 'hh2')))).toBeUndefined();
      expect(await h.run(A(), (tx) => h.repos.household.get(tx, id('hh', 'none')))).toBeUndefined();
      expect(await h.run(B(), (tx) => h.repos.household.get(tx, id('hh', '1')))).toBeUndefined();
    });

    it('AC-M03-09 a link both parties hold stays put on merge, so repointing back restores both parties exactly', async () => {
      await save(A(), mk('sh1', 'Shared One'), mk('sh2', 'Shared Two'));
      const link = (partyKey: string, subjectId: string): PartyRoleLink => ({ partyId: id('pty', partyKey), role: 'INSURED', subjectType: 'HELD_POLICY', subjectId, createdAt: at(5) });
      await h.run(A(), async (tx) => {
        await h.repos.roleLinks.add(tx, link('sh1', 'shared'));
        await h.repos.roleLinks.add(tx, link('sh1', 'own'));
        await h.repos.roleLinks.add(tx, link('sh2', 'shared'));
      });
      const keys = async (key: string) => (await h.run(A(), (tx) => h.repos.roleLinks.forParty(tx, id('pty', key)))).map((l) => l.subjectId).sort();
      const moved = await h.run(A(), (tx) => h.repos.roleLinks.repoint(tx, id('pty', 'sh1'), id('pty', 'sh2')));
      expect(moved).toEqual(['INSURED|HELD_POLICY|own']);
      expect(await keys('sh2')).toEqual(['own', 'shared']);
      await h.run(A(), (tx) => h.repos.roleLinks.repoint(tx, id('pty', 'sh2'), id('pty', 'sh1'), moved));
      expect(await keys('sh1')).toEqual(['own', 'shared']);
      expect(await keys('sh2')).toEqual(['shared']);
    });

    it('AC-M03-09 role links: add is idempotent, repoint moves all or only the listed keys and reports them', async () => {
      await save(A(), mk('rl1', 'Link One'), mk('rl2', 'Link Two'));
      const link = (partyKey: string, subjectId: string, over: Partial<PartyRoleLink> = {}): PartyRoleLink => ({
        partyId: id('pty', partyKey), role: 'INSURED', subjectType: 'HELD_POLICY', subjectId, createdAt: at(5), ...over,
      });
      await h.run(A(), async (tx) => {
        await h.repos.roleLinks.add(tx, link('rl1', 'p1', { label: 'Life' }));
        await h.repos.roleLinks.add(tx, link('rl1', 'p1', { label: 'ignored' }));
        await h.repos.roleLinks.add(tx, link('rl1', 'p2', { role: 'PAYER', subjectType: 'PROPOSAL' }));
        await h.repos.roleLinks.add(tx, link('rl1', 'p3'));
      });
      const forParty = async (key: string) => (await h.run(A(), (tx) => h.repos.roleLinks.forParty(tx, id('pty', key)))).sort((a, b) => a.subjectId.localeCompare(b.subjectId));
      expect((await forParty('rl1')).map((l) => [l.subjectId, l.label])).toEqual([['p1', 'Life'], ['p2', undefined], ['p3', undefined]]);
      const moved = await h.run(A(), (tx) => h.repos.roleLinks.repoint(tx, id('pty', 'rl1'), id('pty', 'rl2'), ['INSURED|HELD_POLICY|p3']));
      expect(moved).toEqual(['INSURED|HELD_POLICY|p3']);
      expect((await forParty('rl2')).map((l) => l.subjectId)).toEqual(['p3']);
      const movedAll = await h.run(A(), (tx) => h.repos.roleLinks.repoint(tx, id('pty', 'rl1'), id('pty', 'rl2')));
      expect(movedAll.sort()).toEqual(['INSURED|HELD_POLICY|p1', 'PAYER|PROPOSAL|p2']);
      expect(await forParty('rl1')).toEqual([]);
      const after = await forParty('rl2');
      expect(after.map((l) => l.subjectId)).toEqual(['p1', 'p2', 'p3']);
      expect(after[0]).toEqual(link('rl2', 'p1', { label: 'Life' }));
      expect(await h.run(B(), (tx) => h.repos.roleLinks.forParty(tx, id('pty', 'rl2')))).toEqual([]);
    });

    it('AC-M03-10 duplicates: the ordered pair is unique, a higher score on an open candidate wins and the queue is ordered and paged', async () => {
      await save(A(), mk('d1', 'Dup One'), mk('d2', 'Dup Two'), mk('d3', 'Dup Three'), mk('d4', 'Dup Four'));
      const [p1, p2, p3, p4] = ['d1', 'd2', 'd3', 'd4'].map((k) => id('pty', k)).sort();
      const cand = (key: string, a: string, b: string, { minutes, ...o }: { score: number; minutes: number } & Partial<DuplicateCandidate>): DuplicateCandidate => ({
        id: id('dc', key), partyAId: a, partyBId: b, rule: 'phone', explanation: `score ${o.score}`, status: 'open', createdAt: at(minutes), ...o,
      });
      const upsert = (c: DuplicateCandidate) => h.run(A(), (tx) => h.repos.duplicates.upsertCandidate(tx, c));
      await upsert(cand('x', p1, p2, { score: 70, minutes: 1 }));
      await upsert(cand('y', p1, p3, { score: 95, minutes: 2 }));
      await upsert(cand('z', p3, p4, { score: 70, minutes: 3 }));
      await upsert(cand('x2', p1, p2, { score: 60, minutes: 4, rule: 'name' }));
      expect(must(await h.run(A(), (tx) => h.repos.duplicates.get(tx, id('dc', 'x')))).score).toBe(70);
      await upsert(cand('x3', p1, p2, { score: 80, minutes: 5, rule: 'pan', explanation: 'same PAN' }));
      expect(await h.run(A(), (tx) => h.repos.duplicates.get(tx, id('dc', 'x3')))).toBeUndefined();
      expect(await h.run(A(), (tx) => h.repos.duplicates.get(tx, id('dc', 'x')))).toEqual(cand('x', p1, p2, { score: 80, minutes: 1, rule: 'pan', explanation: 'same PAN' }));

      const list = (partyId: string | undefined, limit: number, cursor?: string) => h.run(A(), (tx) => h.repos.duplicates.list(tx, { status: 'open', partyId, limit, cursor }));
      expect((await list(p1, 10)).items.map((c) => c.id)).toEqual([id('dc', 'y'), id('dc', 'x')]);
      expect((await list(p4, 10)).items.map((c) => c.id)).toEqual([id('dc', 'z')]);
      const first = await list(p3, 1);
      expect(first.items.map((c) => c.id)).toEqual([id('dc', 'y')]);
      const second = await list(p3, 1, first.nextCursor);
      expect(second.items.map((c) => c.id)).toEqual([id('dc', 'z')]);
      expect(second.nextCursor).toBeUndefined();

      await h.run(A(), (tx) => h.repos.duplicates.setStatus(tx, id('dc', 'x'), 'dismissed'));
      await upsert(cand('x4', p1, p2, { score: 99, minutes: 6 }));
      expect(must(await h.run(A(), (tx) => h.repos.duplicates.get(tx, id('dc', 'x')))).status).toBe('dismissed');
      expect((await list(p1, 10)).items.map((c) => c.id)).toEqual([id('dc', 'y')]);
      await h.run(A(), (tx) => h.repos.duplicates.setStatus(tx, id('dc', 'none'), 'merged'));
      expect(await h.run(A(), (tx) => h.repos.duplicates.get(tx, id('dc', 'none')))).toBeUndefined();
      expect(await h.run(B(), (tx) => h.repos.duplicates.get(tx, id('dc', 'y')))).toBeUndefined();
    });

    it('AC-M03-11 merge records round-trip, including a later reversal', async () => {
      await save(A(), mk('m1', 'Merge One'), mk('m2', 'Merge Two'));
      const m: MergeRecord = {
        id: id('mrg', '1'), survivorId: id('pty', 'm1'), mergedId: id('pty', 'm2'),
        choices: [{ field: 'displayName', from: 'A' }, { field: 'pan', from: 'B' }],
        movedLinks: { roleLinks: 2, consents: 1, household: id('hh', 'x'), householdRelation: 'SPOUSE', roleLinkKeys: ['INSURED|HELD_POLICY|p1'] },
        mergedAt: at(10), mergedBy: 'mem_1', reversibleUntil: at(10 + 30 * 24 * 60),
      };
      await h.run(A(), (tx) => h.repos.duplicates.saveMerge(tx, m));
      expect(await h.run(A(), (tx) => h.repos.duplicates.getMerge(tx, m.id))).toEqual(m);
      await h.run(A(), (tx) => h.repos.duplicates.saveMerge(tx, { ...m, reversedAt: at(20) }));
      expect(await h.run(A(), (tx) => h.repos.duplicates.getMerge(tx, m.id))).toEqual({ ...m, reversedAt: at(20) });
      expect(await h.run(A(), (tx) => h.repos.duplicates.getMerge(tx, id('mrg', 'none')))).toBeUndefined();
      expect(await h.run(B(), (tx) => h.repos.duplicates.getMerge(tx, m.id))).toBeUndefined();
    });

    it('AC-M03-12 tenants are isolated: another tenant sees none of a tenant\'s parties, consent or suppression', async () => {
      await save(A(), mk('iso', 'Isolated Person'));
      await h.run(A(), (tx) => h.repos.consent.append(tx, {
        id: id('cns', 'iso'), partyId: id('pty', 'iso'), purpose: 'SERVICE', channel: 'SMS', granted: true, noticeVersion: 'n1', source: 'WEB_FORM', capturedBy: 'mem_1', occurredAt: at(1),
      }));
      await h.run(A(), (tx) => h.repos.suppression.add(tx, { id: id('sup', 'iso'), contactHash: `hash_${h.suffix}_iso`, channel: 'ANY', reason: 'DSR', from: at(0), createdBy: 'mem_1' }));

      expect(await get(B(), id('pty', 'iso'))).toBeUndefined();
      expect(await h.run(B(), (tx) => h.repos.party.findByContactHash(tx, `hash_${h.suffix}_iso`))).toEqual([]);
      expect((await h.run(B(), (tx) => h.repos.party.list(tx, { scope: { kind: 'TENANT' }, ids: [id('pty', 'iso')], limit: 10 }))).items).toEqual([]);
      expect((await h.run(B(), (tx) => h.repos.consent.ledger(tx, id('pty', 'iso')))).history()).toEqual([]);
      expect(await h.run(B(), (tx) => h.repos.suppression.activeFor(tx, `hash_${h.suffix}_iso`, new Date(at(5))))).toEqual([]);
      expect(await h.run(A(), (tx) => h.repos.suppression.activeFor(tx, `hash_${h.suffix}_iso`, new Date(at(5))))).toHaveLength(1);

      await save(B(), mk('iso-b', 'Isolated Person B'));
      expect(await get(A(), id('pty', 'iso-b'))).toBeUndefined();
      expect(must(await get(B(), id('pty', 'iso-b'))).props.id).toBe(id('pty', 'iso-b'));
    });
  });
}
