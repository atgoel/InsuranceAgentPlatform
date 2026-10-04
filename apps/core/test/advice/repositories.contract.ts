import { Transaction } from '../../src/kernel/persistence/unit-of-work';
import { AdviceRecord, AdviceRecordProps } from '../../src/modules/advice/domain/advice-record';
import { QuoteOptionProps, QuoteRequest, QuoteRequestProps } from '../../src/modules/advice/domain/quote';
import { BiRecord, BiRecordProps } from '../../src/modules/advice/domain/benefit-illustration';
import {
  AdviceRepository,
  BiRepository,
  CalculatorRun,
  CalculatorRunRepository,
  QuoteRepository,
} from '../../src/modules/advice/application/ports';

export interface AdviceHarness {
  repos: { advice: AdviceRepository; quotes: QuoteRepository; bi: BiRepository; runs: CalculatorRunRepository };
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** A clean tenant so every test starts from an empty book. */
  newTenant(): Promise<string>;
  /** Globally unique id (Postgres primary keys are global). */
  uid(label: string): string;
}

const T0 = Date.parse('2026-10-03T06:00:00.000Z');
const at = (offsetMinutes: number): string => new Date(T0 + offsetMinutes * 60_000).toISOString();

export const adviceProps = (id: string, o: Partial<AdviceRecordProps> = {}): AdviceRecordProps => ({
  id,
  partyId: 'pty_1',
  advisorMemberId: 'mem_1',
  calculatorRuns: [],
  scope: {
    disclosure: 'Tied insurers only',
    entityType: 'ORGANISATION',
    versionIdsShown: ['pv_a', 'pv_b'],
    excludedCount: 2,
    evaluatedOn: '2026-10-03',
  },
  recommended: [],
  suitabilityNotes: '',
  status: 'DRAFT',
  version: 1,
  createdAt: at(0),
  ...o,
});

export const optionProps = (id: string, o: Partial<QuoteOptionProps> = {}): QuoteOptionProps => ({
  id,
  versionId: 'pv_hdfc_term_v1',
  insurerId: 'ins_hdfc_life',
  source: 'MANUAL_PORTAL',
  insurerQuoteRef: `QREF-${id}`,
  sumAssuredPaise: 1_000_000_000,
  policyTermYears: 30,
  premiumPayingTermYears: 20,
  premium: { basePaise: 1_000_000, ridersPaise: 100_000, taxPaise: 198_000, totalPaise: 1_298_000, frequency: 'ANNUAL' },
  coverage: [{ label: 'Accidental death', value: 'Included' }],
  exclusions: ['Suicide within 12 months'],
  waitingPeriods: [{ label: 'Initial', months: 1 }],
  assumptions: { smoker: 'no' },
  validUntil: '2026-10-31',
  capturedBy: 'mem_1',
  capturedAt: at(5),
  ...o,
});

export const quoteProps = (id: string, o: Partial<QuoteRequestProps> = {}): QuoteRequestProps => ({
  id,
  opportunityId: 'opp_1',
  partyId: 'pty_1',
  line: 'LIFE',
  insuredPartyIds: ['pty_1', 'pty_2'],
  requirements: { sumAssured: '1cr' },
  options: [],
  status: 'OPEN',
  createdAt: at(0),
  version: 1,
  ...o,
});

const idsOf = (items: Array<{ props: { id: string } }>): string[] => items.map((i) => i.props.id);

/** Behavioural contract every M06 repository set must satisfy; run on the in-memory adapters and on Postgres. */
export function adviceRepositoriesContract(label: string, setup: () => Promise<AdviceHarness>, teardown?: () => Promise<void>): void {
  describe(`${label} M06 repository contract`, () => {
    let h: AdviceHarness;
    beforeAll(async () => {
      h = await setup();
    });
    afterAll(async () => {
      await teardown?.();
    });

    describe('advice records', () => {
      it('AC-M06-11 an advice record round-trips every field, bumps the version and calls markSaved', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('adv');
        const record = AdviceRecord.restore(
          adviceProps(id, {
            opportunityId: 'opp_9',
            calculatorRuns: [
              {
                calculator: 'protection-gap',
                inputs: { income: 1_200_000 },
                outputs: { gapPaise: 5_000_000 },
                assumptionsVersion: 'a1',
                ranAt: at(1),
              },
            ],
            recommended: [{ versionId: 'pv_a', rationale: 'Best claim ratio' }],
            customerChoice: { versionId: 'pv_b', reasonIfDifferent: 'Cheaper' },
            suitabilityNotes: 'Needs term cover',
          }),
        );

        await h.run(tenantId, (tx) => h.repos.advice.save(tx, record));
        const read = await h.run(tenantId, (tx) => h.repos.advice.get(tx, id));

        expect(record.props.version).toBe(2);
        expect(read?.props).toEqual({ ...record.props, version: 2 });
        expect(read?.props.customerChoice).toEqual({ versionId: 'pv_b', reasonIfDifferent: 'Cheaper' });
        expect(read?.props.calculatorRuns).toEqual([
          {
            calculator: 'protection-gap',
            inputs: { income: 1_200_000 },
            outputs: { gapPaise: 5_000_000 },
            assumptionsVersion: 'a1',
            ranAt: at(1),
          },
        ]);
        expect(read?.props.opportunityId).toBe('opp_9');
        expect(read?.props.finalisedAt).toBeUndefined();
        expect(await h.run(tenantId, (tx) => h.repos.advice.get(tx, h.uid('missing')))).toBeUndefined();
      });

      it('AC-M06-11 a finalised record round-trips with its finalisedAt', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('adv');
        const record = AdviceRecord.restore(adviceProps(id, { status: 'FINALISED', finalisedAt: at(30), suitabilityNotes: 'Done' }));

        await h.run(tenantId, (tx) => h.repos.advice.save(tx, record));
        const read = await h.run(tenantId, (tx) => h.repos.advice.get(tx, id));

        expect(read?.props).toMatchObject({ id, status: 'FINALISED', finalisedAt: at(30), suitabilityNotes: 'Done', version: 2 });
      });

      it('AC-M06-11 a stale version is refused with version_mismatch and the stored row is unchanged', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('adv');
        await h.run(tenantId, (tx) => h.repos.advice.save(tx, AdviceRecord.restore(adviceProps(id))));
        const stale = AdviceRecord.restore(adviceProps(id, { suitabilityNotes: 'stale write' }));

        await expect(h.run(tenantId, (tx) => h.repos.advice.save(tx, stale))).rejects.toMatchObject({ code: 'version_mismatch' });

        const read = await h.run(tenantId, (tx) => h.repos.advice.get(tx, id));
        expect(read?.props.suitabilityNotes).toBe('');
        expect(read?.props.version).toBe(2);
      });

      it('AC-M06-11 forParty returns only that party, newest first', async () => {
        const tenantId = await h.newTenant();
        const [a, b, c, other] = [h.uid('adv'), h.uid('adv'), h.uid('adv'), h.uid('adv')];
        await h.run(tenantId, async (tx) => {
          await h.repos.advice.save(tx, AdviceRecord.restore(adviceProps(a, { createdAt: at(1) })));
          await h.repos.advice.save(tx, AdviceRecord.restore(adviceProps(b, { createdAt: at(3) })));
          await h.repos.advice.save(tx, AdviceRecord.restore(adviceProps(c, { createdAt: at(2) })));
          await h.repos.advice.save(tx, AdviceRecord.restore(adviceProps(other, { partyId: 'pty_other', createdAt: at(4) })));
        });

        const list = await h.run(tenantId, (tx) => h.repos.advice.forParty(tx, 'pty_1'));

        expect(idsOf(list)).toEqual([b, c, a]);
      });

      it('AC-M06-10 another tenant cannot read or list a tenant advice records', async () => {
        const [tenantA, tenantB] = [await h.newTenant(), await h.newTenant()];
        const id = h.uid('adv');
        await h.run(tenantA, (tx) => h.repos.advice.save(tx, AdviceRecord.restore(adviceProps(id))));

        expect(await h.run(tenantB, (tx) => h.repos.advice.get(tx, id))).toBeUndefined();
        expect(await h.run(tenantB, (tx) => h.repos.advice.forParty(tx, 'pty_1'))).toEqual([]);
        expect(idsOf(await h.run(tenantA, (tx) => h.repos.advice.forParty(tx, 'pty_1')))).toEqual([id]);
      });
    });

    describe('quotes', () => {
      it('AC-M06-11 a quote with options round-trips every field in option order, bumps the version and calls markSaved', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('qte');
        const [o1, o2] = [h.uid('opt'), h.uid('opt')];
        const quote = QuoteRequest.restore(
          quoteProps(id, {
            adviceRecordId: 'adv_1',
            status: 'SHARED',
            sharedAt: at(10),
            options: [
              optionProps(o1),
              optionProps(o2, {
                source: 'INSURER_API',
                insurerQuoteRef: undefined,
                policyTermYears: undefined,
                premiumPayingTermYears: undefined,
                validUntil: '2026-12-01',
                versionId: 'pv_icici_ulip_v1',
                insurerId: 'ins_icici_pru',
              }),
            ],
          }),
        );

        await h.run(tenantId, (tx) => h.repos.quotes.save(tx, quote));
        const read = await h.run(tenantId, (tx) => h.repos.quotes.get(tx, id));

        expect(quote.props.version).toBe(2);
        expect(read?.props).toEqual({ ...quote.props, version: 2 });
        expect(read?.props.options.map((o) => o.id)).toEqual([o1, o2]);
        expect(read?.props.options[0]).toEqual(optionProps(o1));
        expect(read?.props.options[1].validUntil).toBe('2026-12-01');
        expect(read?.props.options[1].insurerQuoteRef).toBeUndefined();
        expect(read?.props.options[1].policyTermYears).toBeUndefined();
        expect(read?.props.options[0].premium).toEqual({
          basePaise: 1_000_000,
          ridersPaise: 100_000,
          taxPaise: 198_000,
          totalPaise: 1_298_000,
          frequency: 'ANNUAL',
        });
        expect(await h.run(tenantId, (tx) => h.repos.quotes.get(tx, h.uid('missing')))).toBeUndefined();
      });

      it('AC-M06-11 saving again with an option removed deletes it and keeps the rest in order', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('qte');
        const [o1, o2, o3] = [h.uid('opt'), h.uid('opt'), h.uid('opt')];
        const quote = QuoteRequest.restore(quoteProps(id, { options: [optionProps(o1), optionProps(o2), optionProps(o3)] }));
        await h.run(tenantId, (tx) => h.repos.quotes.save(tx, quote));

        quote.removeOption(o2);
        await h.run(tenantId, (tx) => h.repos.quotes.save(tx, quote));
        const read = await h.run(tenantId, (tx) => h.repos.quotes.get(tx, id));

        expect(read?.props.options.map((o) => o.id)).toEqual([o1, o3]);
        expect(read?.props.version).toBe(3);
        expect(await h.run(tenantId, (tx) => h.repos.quotes.findOption(tx, o2))).toBeUndefined();
      });

      it('AC-M06-11 a stale quote version is refused with version_mismatch and options are not touched', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('qte');
        const o1 = h.uid('opt');
        await h.run(tenantId, (tx) => h.repos.quotes.save(tx, QuoteRequest.restore(quoteProps(id, { options: [optionProps(o1)] }))));
        const stale = QuoteRequest.restore(quoteProps(id, { options: [] }));

        await expect(h.run(tenantId, (tx) => h.repos.quotes.save(tx, stale))).rejects.toMatchObject({ code: 'version_mismatch' });

        const read = await h.run(tenantId, (tx) => h.repos.quotes.get(tx, id));
        expect(read?.props.options.map((o) => o.id)).toEqual([o1]);
      });

      it('AC-M06-11 findOption returns the option with its owning request, and nothing for an unknown id', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('qte');
        const [o1, o2] = [h.uid('opt'), h.uid('opt')];
        await h.run(tenantId, (tx) =>
          h.repos.quotes.save(
            tx,
            QuoteRequest.restore(quoteProps(id, { options: [optionProps(o1), optionProps(o2, { validUntil: '2026-11-15' })] })),
          ),
        );

        const found = await h.run(tenantId, (tx) => h.repos.quotes.findOption(tx, o2));

        expect(found?.request.props.id).toBe(id);
        expect(found?.request.props.options.map((o) => o.id)).toEqual([o1, o2]);
        expect(found?.option).toEqual(optionProps(o2, { validUntil: '2026-11-15' }));
        expect(await h.run(tenantId, (tx) => h.repos.quotes.findOption(tx, h.uid('missing')))).toBeUndefined();
      });

      it('AC-M06-11 forOpportunity returns only that opportunity, newest first', async () => {
        const tenantId = await h.newTenant();
        const [a, b, c, other] = [h.uid('qte'), h.uid('qte'), h.uid('qte'), h.uid('qte')];
        await h.run(tenantId, async (tx) => {
          await h.repos.quotes.save(tx, QuoteRequest.restore(quoteProps(a, { createdAt: at(1) })));
          await h.repos.quotes.save(tx, QuoteRequest.restore(quoteProps(b, { createdAt: at(3) })));
          await h.repos.quotes.save(tx, QuoteRequest.restore(quoteProps(c, { createdAt: at(2) })));
          await h.repos.quotes.save(tx, QuoteRequest.restore(quoteProps(other, { opportunityId: 'opp_other', createdAt: at(4) })));
        });

        const list = await h.run(tenantId, (tx) => h.repos.quotes.forOpportunity(tx, 'opp_1'));

        expect(idsOf(list)).toEqual([b, c, a]);
      });

      it('AC-M06-07 openWithValidityBefore returns OPEN/SHARED quotes whose latest option validity is before the date', async () => {
        const tenantId = await h.newTenant();
        const [stale, partlyStale, fresh, noOptions, selected, shared] = [
          h.uid('qte'),
          h.uid('qte'),
          h.uid('qte'),
          h.uid('qte'),
          h.uid('qte'),
          h.uid('qte'),
        ];
        await h.run(tenantId, async (tx) => {
          await h.repos.quotes.save(
            tx,
            QuoteRequest.restore(quoteProps(stale, { options: [optionProps(h.uid('opt'), { validUntil: '2026-10-01' })] })),
          );
          await h.repos.quotes.save(
            tx,
            QuoteRequest.restore(
              quoteProps(partlyStale, {
                options: [optionProps(h.uid('opt'), { validUntil: '2026-10-01' }), optionProps(h.uid('opt'), { validUntil: '2026-10-10' })],
              }),
            ),
          );
          await h.repos.quotes.save(
            tx,
            QuoteRequest.restore(quoteProps(fresh, { options: [optionProps(h.uid('opt'), { validUntil: '2026-10-05' })] })),
          );
          await h.repos.quotes.save(tx, QuoteRequest.restore(quoteProps(noOptions)));
          const sel = optionProps(h.uid('opt'), { validUntil: '2026-09-01' });
          await h.repos.quotes.save(
            tx,
            QuoteRequest.restore(quoteProps(selected, { status: 'SELECTED', selectedOptionId: sel.id, selectedAt: at(9), options: [sel] })),
          );
          await h.repos.quotes.save(
            tx,
            QuoteRequest.restore(
              quoteProps(shared, { status: 'SHARED', sharedAt: at(2), options: [optionProps(h.uid('opt'), { validUntil: '2026-09-30' })] }),
            ),
          );
        });

        const due = await h.run(tenantId, (tx) => h.repos.quotes.openWithValidityBefore(tx, '2026-10-05', 50));
        const limited = await h.run(tenantId, (tx) => h.repos.quotes.openWithValidityBefore(tx, '2026-10-05', 1));

        expect(idsOf(due).sort()).toEqual([stale, shared].sort());
        expect(limited).toHaveLength(1);
      });

      it('AC-M06-07 removing the latest option lowers the quote latest validity so it becomes a candidate', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('qte');
        const [early, late] = [h.uid('opt'), h.uid('opt')];
        const quote = QuoteRequest.restore(
          quoteProps(id, { options: [optionProps(early, { validUntil: '2026-10-01' }), optionProps(late, { validUntil: '2026-10-20' })] }),
        );
        await h.run(tenantId, (tx) => h.repos.quotes.save(tx, quote));
        expect(await h.run(tenantId, (tx) => h.repos.quotes.openWithValidityBefore(tx, '2026-10-05', 50))).toEqual([]);

        quote.removeOption(late);
        await h.run(tenantId, (tx) => h.repos.quotes.save(tx, quote));

        expect(idsOf(await h.run(tenantId, (tx) => h.repos.quotes.openWithValidityBefore(tx, '2026-10-05', 50)))).toEqual([id]);
      });

      it('AC-M06-10 another tenant cannot read, list or find a tenant quotes and options', async () => {
        const [tenantA, tenantB] = [await h.newTenant(), await h.newTenant()];
        const id = h.uid('qte');
        const o1 = h.uid('opt');
        await h.run(tenantA, (tx) =>
          h.repos.quotes.save(tx, QuoteRequest.restore(quoteProps(id, { options: [optionProps(o1, { validUntil: '2026-09-01' })] }))),
        );

        expect(await h.run(tenantB, (tx) => h.repos.quotes.get(tx, id))).toBeUndefined();
        expect(await h.run(tenantB, (tx) => h.repos.quotes.forOpportunity(tx, 'opp_1'))).toEqual([]);
        expect(await h.run(tenantB, (tx) => h.repos.quotes.findOption(tx, o1))).toBeUndefined();
        expect(await h.run(tenantB, (tx) => h.repos.quotes.openWithValidityBefore(tx, '2026-10-05', 50))).toEqual([]);
        expect(idsOf(await h.run(tenantA, (tx) => h.repos.quotes.openWithValidityBefore(tx, '2026-10-05', 50)))).toEqual([id]);
      });
    });

    describe('benefit illustrations', () => {
      const biProps = (id: string, optionId: string, o: Partial<BiRecordProps> = {}): BiRecordProps => ({
        id,
        quoteOptionId: optionId,
        documentRef: 'doc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        insurerBiVersion: 'BI-2026.1',
        uploadedBy: 'mem_1',
        uploadedAt: at(20),
        version: 1,
        ...o,
      });

      async function quoteWithOption(tenantId: string): Promise<string> {
        const optionId = h.uid('opt');
        await h.run(tenantId, (tx) =>
          h.repos.quotes.save(tx, QuoteRequest.restore(quoteProps(h.uid('qte'), { options: [optionProps(optionId)] }))),
        );
        return optionId;
      }

      it('AC-M06-11 a BI record round-trips with its acknowledgement, bumps the version and calls markSaved', async () => {
        const tenantId = await h.newTenant();
        const optionId = await quoteWithOption(tenantId);
        const id = h.uid('bi');
        const bi = BiRecord.restore(biProps(id, optionId));
        await h.run(tenantId, (tx) => h.repos.bi.save(tx, bi));
        expect(bi.props.version).toBe(2);

        const withAck = BiRecord.restore({
          ...bi.props,
          acknowledgement: { method: 'ASSISTED', at: at(40), by: 'mem_1', evidenceRef: 'doc_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
        });
        await h.run(tenantId, (tx) => h.repos.bi.save(tx, withAck));
        const read = await h.run(tenantId, (tx) => h.repos.bi.get(tx, id));

        expect(read?.props).toEqual({
          ...biProps(id, optionId),
          acknowledgement: { method: 'ASSISTED', at: at(40), by: 'mem_1', evidenceRef: 'doc_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
          version: 3,
        });
        expect(await h.run(tenantId, (tx) => h.repos.bi.get(tx, h.uid('missing')))).toBeUndefined();
      });

      it('AC-M06-11 a stale BI version is refused with version_mismatch', async () => {
        const tenantId = await h.newTenant();
        const optionId = await quoteWithOption(tenantId);
        const id = h.uid('bi');
        await h.run(tenantId, (tx) => h.repos.bi.save(tx, BiRecord.restore(biProps(id, optionId))));

        await expect(
          h.run(tenantId, (tx) => h.repos.bi.save(tx, BiRecord.restore(biProps(id, optionId, { insurerBiVersion: 'BI-STALE' })))),
        ).rejects.toMatchObject({ code: 'version_mismatch' });
      });

      it('AC-M06-11 forOption returns that option records oldest first, and another tenant sees none', async () => {
        const [tenantA, tenantB] = [await h.newTenant(), await h.newTenant()];
        const optionId = await quoteWithOption(tenantA);
        const [first, second] = [h.uid('bi'), h.uid('bi')];
        await h.run(tenantA, async (tx) => {
          await h.repos.bi.save(tx, BiRecord.restore(biProps(second, optionId, { uploadedAt: at(30) })));
          await h.repos.bi.save(tx, BiRecord.restore(biProps(first, optionId, { uploadedAt: at(20) })));
        });

        expect(idsOf(await h.run(tenantA, (tx) => h.repos.bi.forOption(tx, optionId)))).toEqual([first, second]);
        expect(await h.run(tenantB, (tx) => h.repos.bi.forOption(tx, optionId))).toEqual([]);
        expect(await h.run(tenantB, (tx) => h.repos.bi.get(tx, first))).toBeUndefined();
      });
    });

    describe('calculator runs', () => {
      const run = (id: string, o: Partial<CalculatorRun> = {}): CalculatorRun => ({
        id,
        partyId: 'pty_1',
        calculator: 'protection-gap',
        inputs: { income: 1_200_000, dependants: 2 },
        outputs: { gapPaise: 5_000_000, notes: ['a'] },
        assumptionsVersion: 'a1',
        ranBy: 'mem_1',
        ranAt: at(0),
        ...o,
      });

      it('AC-M06-11 a calculator run round-trips its JSON inputs and outputs', async () => {
        const tenantId = await h.newTenant();
        const id = h.uid('run');

        await h.run(tenantId, (tx) => h.repos.runs.add(tx, run(id)));
        const read = await h.run(tenantId, (tx) => h.repos.runs.forParty(tx, 'pty_1', 10));

        expect(read).toEqual([run(id)]);
      });

      it('AC-M06-11 forParty returns that party runs newest first, honours the limit, and hides other tenants', async () => {
        const [tenantA, tenantB] = [await h.newTenant(), await h.newTenant()];
        const [a, b, c, other] = [h.uid('run'), h.uid('run'), h.uid('run'), h.uid('run')];
        await h.run(tenantA, async (tx) => {
          await h.repos.runs.add(tx, run(a, { ranAt: at(1) }));
          await h.repos.runs.add(tx, run(b, { ranAt: at(3) }));
          await h.repos.runs.add(tx, run(c, { ranAt: at(2) }));
          await h.repos.runs.add(tx, run(other, { partyId: 'pty_other', ranAt: at(4) }));
        });

        expect((await h.run(tenantA, (tx) => h.repos.runs.forParty(tx, 'pty_1', 10))).map((r) => r.id)).toEqual([b, c, a]);
        expect((await h.run(tenantA, (tx) => h.repos.runs.forParty(tx, 'pty_1', 2))).map((r) => r.id)).toEqual([b, c]);
        expect(await h.run(tenantB, (tx) => h.repos.runs.forParty(tx, 'pty_1', 10))).toEqual([]);
      });
    });
  });
}
