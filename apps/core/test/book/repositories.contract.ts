import { HeldPolicy } from '../../src/modules/book/domain/held-policy';
import { policy } from '../../src/modules/book/domain/test-fixture';
import { ImportBatch } from '../../src/modules/book/domain/book-import';
import { ServicingRequest } from '../../src/modules/book/domain/servicing';
import {
  AlertLedger,
  HeldPolicyRepository,
  ImportBatchRepository,
  ServicingRepository,
  Transaction,
} from '../../src/modules/book/application/ports';
export interface Harness {
  policies: HeldPolicyRepository;
  imports: ImportBatchRepository;
  servicing: ServicingRepository;
  ledger: AlertLedger;
  tenantA: string;
  tenantB: string;
  suffix: string;
  run<T>(tenant: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
}
export function bookRepositoryContract(label: string, setup: () => Promise<Harness>, teardown?: () => Promise<void>) {
  describe(`AC-M07-14 ${label} book repository contract`, () => {
    let h: Harness;
    beforeAll(async () => {
      h = await setup();
    });
    if (teardown) afterAll(teardown);
    const id = (key: string) => `${h.suffix}_${key}`;
    const held = (key: string, extra: Parameters<typeof policy>[0] = {}) =>
      HeldPolicy.restore(policy({ id: id(key), proposerPartyId: id('party'), policyNumberHash: id(`hash_${key}`), ...extra }));
    const save = (p: HeldPolicy) => h.run(h.tenantA, (tx) => h.policies.save(tx, p));
    it('AC-M07-01 persists encrypted identifiers and rejects stale versions', async () => {
      const p = held('roundtrip', {
        policyNumberEnc: 'encrypted:POL1234',
        registrationNoEnc: 'encrypted:MH01AA1234',
        registrationNoHash: 'registration-hash',
        registrationNoLast4: '1234',
        insurerId: 'insurer-id',
        productVersionId: 'product-version',
        sumAssuredPaise: 10000000,
        maturityDate: '2056-01-31',
        premiumPayingTermYears: 10,
        policyTermYears: 30,
        confidence: 'LOW',
        source: 'IMPORT',
        sourceRef: 'import:7',
        distanceSale: true,
        bookingChannel: { code: 'ONLINE', insurerCodeId: 'booking-id' },
        risk: { schemaId: 'life', schemaVersion: 1, details: { occupation: 'Engineer' } },
        commercials: {
          ...policy().commercials,
          previousInsurerName: 'Prior Insurer',
          policyTermMonths: 360,
          bookingChannelCode: 'ONLINE',
          businessSource: 'REFERRAL',
          referredBy: { name: 'Meera', partyId: 'ref-party', memberId: 'ref-member' },
          remarks: 'Register note',
        },
        customFields: { segment: 'VIP' },
      });
      await save(p);
      const got = await h.run(h.tenantA, (tx) => h.policies.get(tx, p.props.id));
      expect(got?.props).toEqual(p.props);
      const stale = HeldPolicy.restore({ ...p.props, version: p.props.version - 1 });
      await expect(save(stale)).rejects.toMatchObject({ code: 'version_mismatch' });
      expect(await h.run(h.tenantB, (tx) => h.policies.get(tx, p.props.id))).toBeUndefined();
    });
    it('AC-M07-01 policy number and platform sale references are tenant unique', async () => {
      const a = held('unique', { saleRef: { policySaleId: id('sale') } });
      await save(a);
      await expect(save(held('dup', { policyNumberHash: a.props.policyNumberHash }))).rejects.toMatchObject({
        code: 'policy_number_taken',
      });
      await expect(save(held('sale_dup', { saleRef: a.props.saleRef }))).rejects.toMatchObject({ code: 'policy_number_taken' });
      expect((await h.run(h.tenantA, (tx) => h.policies.findBySaleRef(tx, id('sale'))))?.props.id).toBe(a.props.id);
    });
    it('AC-M07-13 filters own policy rows and descriptive register fields', async () => {
      const p = held('filter', {
        servicingMemberId: 'own',
        customFields: { segment: 'VIP' },
        commercials: { ...policy().commercials, businessSource: 'REFERRAL', referredBy: { name: 'Meera' } },
      });
      await save(p);
      const result = await h.run(h.tenantA, (tx) =>
        h.policies.list(tx, {
          scope: { kind: 'OWN', memberId: 'own' },
          businessSource: 'REFERRAL',
          referredBy: 'meer',
          custom: { segment: 'VIP' },
          limit: 10,
        }),
      );
      expect(result.items.map((p) => p.props.id)).toEqual([p.props.id]);
      expect((await h.run(h.tenantB, (tx) => h.policies.list(tx, { scope: { kind: 'TENANT' }, limit: 100 }))).items).toEqual([]);
    });
    it('AC-M07-05 stores each installment payment once', async () => {
      const p = held('payment');
      await save(p);
      const input = { policyId: p.props.id, installmentDue: '2026-02-28', paidOn: '2026-03-01', id: id('pay') };
      expect(await h.run(h.tenantA, (tx) => h.policies.paymentRecorded(tx, p.props.id, input.installmentDue))).toBe(false);
      expect(await h.run(h.tenantA, (tx) => h.policies.recordPayment(tx, input))).toBe(true);
      expect(await h.run(h.tenantA, (tx) => h.policies.paymentRecorded(tx, p.props.id, input.installmentDue))).toBe(true);
      expect(await h.run(h.tenantB, (tx) => h.policies.paymentRecorded(tx, p.props.id, input.installmentDue))).toBe(false);
      expect(await h.run(h.tenantA, (tx) => h.policies.recordPayment(tx, { ...input, id: id('pay2') }))).toBe(false);
    });
    it('AC-M07-08 persists import replay identity and discards raw PII', async () => {
      const batch = ImportBatch.upload({
        id: id('batch'),
        format: 'CSV_TEMPLATE',
        fileChecksum: id('checksum'),
        asOf: '2026-10-03',
        ownerMemberId: 'own',
        rows: [{ mobile: '+919876543210', dob: '1990-01-01' }],
        now: new Date('2026-10-03Z'),
      });
      await h.run(h.tenantA, (tx) => h.imports.save(tx, batch));
      expect((await h.run(h.tenantA, (tx) => h.imports.findByChecksum(tx, id('checksum'))))?.props.id).toBe(batch.props.id);
      expect(await h.run(h.tenantB, (tx) => h.imports.get(tx, batch.props.id))).toBeUndefined();
      batch.discard();
      await h.run(h.tenantA, (tx) => h.imports.save(tx, batch));
      expect((await h.run(h.tenantA, (tx) => h.imports.get(tx, batch.props.id)))?.props.rows).toEqual([]);
    });
    it('AC-M07-12 persists servicing notes and terminal follow-up exclusions', async () => {
      const p = held('service_policy');
      await save(p);
      const r = ServicingRequest.create({
        id: id('service'),
        heldPolicyId: p.props.id,
        kind: 'CLAIM',
        followUpOn: '2026-10-03',
        now: new Date('2026-10-03Z'),
      });
      r.addNote('Documents received', 'own', new Date('2026-10-03Z'));
      await h.run(h.tenantA, (tx) => h.servicing.save(tx, r));
      expect((await h.run(h.tenantA, (tx) => h.servicing.get(tx, r.props.id)))?.props).toEqual(r.props);
      expect(await h.run(h.tenantB, (tx) => h.servicing.get(tx, r.props.id))).toBeUndefined();
      expect(
        (await h.run(h.tenantA, (tx) => h.servicing.openFollowUpsBefore(tx, '2026-10-03'))).some((s) => s.props.id === r.props.id),
      ).toBe(true);
      r.transition('SUBMITTED_TO_INSURER');
      r.transition('RESOLVED');
      await h.run(h.tenantA, (tx) => h.servicing.save(tx, r));
      expect(
        (await h.run(h.tenantA, (tx) => h.servicing.openFollowUpsBefore(tx, '2026-10-03'))).some((s) => s.props.id === r.props.id),
      ).toBe(false);
    });
    it('AC-M07-06 stores emitted lifecycle keys once within each tenant', async () => {
      const key = id('alert');
      await h.run(h.tenantA, (tx) => h.ledger.record(tx, [key, key]));
      expect(await h.run(h.tenantA, (tx) => h.ledger.emittedKeys(tx, [key, 'absent']))).toEqual(new Set([key]));
      expect(await h.run(h.tenantB, (tx) => h.ledger.emittedKeys(tx, [key]))).toEqual(new Set());
    });
  });
}
