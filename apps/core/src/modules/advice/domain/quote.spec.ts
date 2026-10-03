import { BusinessRuleError, ConflictError, ValidationError } from '../../../kernel/errors/domain-errors';
import { QuoteOptionProps, QuoteRequest } from './quote';

// 2026-10-03 06:00 UTC = 11:30 IST on 2026-10-03
const now = new Date('2026-10-03T06:00:00.000Z');
const open = () => QuoteRequest.open({ id: 'qr_1', opportunityId: 'opp_1', partyId: 'pty_1', line: 'LIFE', insuredPartyIds: ['pty_1', 'pty_1'], requirements: { cover: '1cr' }, now });
const option = (over: Partial<QuoteOptionProps> = {}): QuoteOptionProps => ({
  id: 'qo_1',
  versionId: 'pv_a',
  insurerId: 'ins_a',
  source: 'MANUAL_PORTAL',
  insurerQuoteRef: 'Q-1',
  sumAssuredPaise: 1_000_000_000,
  policyTermYears: 30,
  premium: { basePaise: 1_000_000, ridersPaise: 100_000, taxPaise: 198_000, totalPaise: 1_298_000, frequency: 'ANNUAL' },
  coverage: [{ label: 'Terminal illness', value: 'Included' }],
  exclusions: ['Suicide in year 1'],
  waitingPeriods: [],
  assumptions: { smoker: 'no' },
  validUntil: '2026-10-20',
  capturedBy: 'mem_1',
  capturedAt: now.toISOString(),
  ...over,
});

describe('AC-M06-05 quote options', () => {
  it('AC-M06-05 premium components must add up', () => {
    const q = open();
    expect(() => q.addOption(option({ premium: { basePaise: 100, ridersPaise: 0, taxPaise: 18, totalPaise: 119, frequency: 'ANNUAL' } }), now)).toThrow(
      expect.objectContaining({ code: 'premium_components_mismatch' }),
    );
    expect(() => q.addOption(option({ premium: { basePaise: 100.5, ridersPaise: 0, taxPaise: 0, totalPaise: 100.5, frequency: 'ANNUAL' } }), now)).toThrow(ValidationError);
  });

  it('AC-M06-05 validity runs from today to at most 60 days ahead (IST)', () => {
    const q = open();
    expect(() => q.addOption(option({ validUntil: '2026-12-03' }), now)).toThrow(expect.objectContaining({ code: 'invalid_validity' }));
    expect(() => q.addOption(option({ validUntil: '2026-10-02' }), now)).toThrow(expect.objectContaining({ code: 'invalid_validity' }));
    q.addOption(option({ validUntil: '2026-12-02' }), now);
    expect(q.props.options).toHaveLength(1);
  });

  it('AC-M06-05 rejects duplicates of version + insurer quote reference', () => {
    const q = open();
    q.addOption(option(), now);
    expect(() => q.addOption(option({ id: 'qo_2' }), now)).toThrow(ConflictError);
    q.addOption(option({ id: 'qo_3', insurerQuoteRef: 'Q-2' }), now);
    q.addOption(option({ id: 'qo_4', insurerQuoteRef: undefined }), now);
    expect(() => q.addOption(option({ id: 'qo_5', insurerQuoteRef: undefined }), now)).toThrow(expect.objectContaining({ code: 'duplicate_option' }));
  });

  it('AC-M06-05 allows at most 10 options', () => {
    const q = open();
    for (let i = 0; i < 10; i++) q.addOption(option({ id: `qo_${i}`, insurerQuoteRef: `Q-${i}` }), now);
    expect(() => q.addOption(option({ id: 'qo_x', insurerQuoteRef: 'Q-x' }), now)).toThrow(expect.objectContaining({ code: 'too_many_options' }));
  });

  it('de-duplicates insured parties on open', () => {
    expect(open().props.insuredPartyIds).toEqual(['pty_1']);
  });
});

describe('AC-M06-06 selection', () => {
  it('AC-M06-06 selects once and refuses a second selection', () => {
    const q = open();
    q.addOption(option(), now);
    q.markShared(now);
    expect(q.select('qo_1', now).versionId).toBe('pv_a');
    expect(q.props.status).toBe('SELECTED');
    expect(() => q.select('qo_1', now)).toThrow(expect.objectContaining({ code: 'quote_already_selected' }));
    expect(() => q.removeOption('qo_1')).toThrow(expect.objectContaining({ code: 'quote_selected' }));
    expect(() => q.addOption(option({ id: 'qo_2', insurerQuoteRef: 'Q-2' }), now)).toThrow(expect.objectContaining({ code: 'quote_closed' }));
  });

  it('AC-M06-06 refuses an option past its validity on the IST date', () => {
    const q = open();
    q.addOption(option({ validUntil: '2026-10-03' }), now);
    // 2026-10-03T19:00Z is 00:30 IST on 2026-10-04
    expect(() => q.select('qo_1', new Date('2026-10-03T19:00:00.000Z'))).toThrow(expect.objectContaining({ code: 'quote_expired' }));
    expect(q.select('qo_1', new Date('2026-10-03T18:00:00.000Z')).id).toBe('qo_1');
  });

  it('sharing needs at least one option', () => {
    expect(() => open().markShared(now)).toThrow(BusinessRuleError);
  });

  it('expires when every option is past validity and nothing was selected', () => {
    const q = open();
    q.addOption(option({ validUntil: '2026-10-05' }), now);
    q.addOption(option({ id: 'qo_2', insurerQuoteRef: 'Q-2', validUntil: '2026-10-10' }), now);
    expect(q.expireIfStale('2026-10-10')).toBe(false);
    expect(q.expireIfStale('2026-10-11')).toBe(true);
    expect(q.props.status).toBe('EXPIRED');
    expect(open().expireIfStale('2027-01-01')).toBe(false);
  });

  it('builds comparison rows with one column per option', () => {
    const q = open();
    q.addOption(option(), now);
    q.addOption(option({ id: 'qo_2', insurerQuoteRef: 'Q-2', coverage: [{ label: 'Accidental death', value: '₹1 cr' }], exclusions: [], waitingPeriods: [{ label: 'Pre-existing', months: 36 }] }), now);
    const rows = q.comparison();
    expect(rows.find((r) => r.key === 'premium_total')?.values).toEqual([1_298_000, 1_298_000]);
    expect(rows.find((r) => r.key === 'coverage:Terminal illness')?.values).toEqual(['Included', null]);
    expect(rows.find((r) => r.key === 'coverage:Accidental death')?.values).toEqual([null, '₹1 cr']);
    expect(rows.find((r) => r.key === 'exclusions')?.values).toEqual(['Suicide in year 1', null]);
    expect(rows.find((r) => r.key === 'waiting:Pre-existing')?.values).toEqual([null, 36]);
  });
});
