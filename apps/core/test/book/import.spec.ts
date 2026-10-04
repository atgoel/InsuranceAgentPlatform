import { ImportBatch, suggestMapping, parseImportRow } from '../../src/modules/book/domain/book-import';
import { importDate, importMoney } from '../../src/modules/book/domain/book-import-values';

function parse(overrides: Record<string, string> = {}) {
  const row = {
    policyNumber: 'PN1234',
    insurerName: 'Insurer',
    productName: 'Term',
    holderName: 'Asha',
    premiumGross: '1,180.25',
    premiumNet: '1000.25',
    commencementDate: '01-Jan-2026',
    category: 'TERM',
    ...overrides,
  };
  return parseImportRow(row, Object.fromEntries(Object.keys(row).map((key) => [key, key])), '2026-10-03');
}

describe('AC-M07-07 import mapping and validation', () => {
  it('AC-CR001-06 maps register headers and rejects text in Commission by column', () => {
    const mapping = suggestMapping(['Policy No.', 'Company Name', 'Client Name', 'Commission', 'Prem. with GST']);
    expect(mapping).toEqual({
      policyNumber: 'Policy No.',
      insurerName: 'Company Name',
      holderName: 'Client Name',
      commissionAmount: 'Commission',
      premiumGross: 'Prem. with GST',
    });
    const result = parseImportRow({ Commission: 'SAURABH' }, { commissionAmount: 'Commission' }, '2026-07-02');
    expect(result.problems).toContain('invalid_amount:Commission');
  });
  it('AC-M07-08 refuses undecided or invalid imports and purges raw data on discard', () => {
    const batch = ImportBatch.upload({
      id: 'batch1',
      format: 'CSV_TEMPLATE',
      fileChecksum: 'checksum',
      asOf: '2026-07-02',
      rows: [{ policyNumber: '1234' }],
      now: new Date('2026-07-02T00:00:00Z'),
      ownerMemberId: 'm1',
    });
    expect(batch.readyToCommit()).toBe(false);
    batch.discard();
    expect(batch.props.state).toBe('DISCARDED');
    expect(batch.props.rows).toEqual([]);
  });
  it('AC-M07-07 parses all documented date formats and rejects impossible dates', () => {
    expect(['02-07-2026', '02/07/2026', '2026-07-02', '02-Jul-2026'].map(importDate)).toEqual([
      '2026-07-02',
      '2026-07-02',
      '2026-07-02',
      '2026-07-02',
    ]);
    expect(importDate('31-02-2026')).toBeUndefined();
    expect(importDate('01-Xxx-2026')).toBeUndefined();
  });
  it('AC-M07-07 parses integer paise without rounding money words or unsafe amounts', () => {
    expect(importMoney('₹ 1,180.25')).toBe(118025);
    expect(importMoney('1.01')).toBe(101);
    expect(['1 lakh', '2 crore', '12.123', '-1', '9007199254740991'].map(importMoney)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
  it('AC-M07-07 validates date, status, contacts and mode with row reasons', () => {
    const row = parse({ nextDueDate: '30-02-2026', status: 'ALIEN', mode: 'WEEKLY', mobile: '99532xxxxx', email: 'wrong' });
    expect(row.problems).toEqual(
      expect.arrayContaining([
        'invalid_date:nextDueDate',
        'invalid_status',
        'invalid_mode:mode',
        'invalid_contact:mobile',
        'invalid_contact:email',
      ]),
    );
  });
  it('AC-CR001-06 validates every duplicate gross column after case and spacing normalization', () => {
    const row = parse({ ' final PREMIUM ': 'oops', 'prem. WITH gst': '1180.25' });
    expect(row.problems).toContain('invalid_amount: final PREMIUM ');
    expect(parse({ ' final PREMIUM ': '1180', 'prem. WITH gst': '1181' }).problems).toContain('premium_mismatch');
  });
  it('AC-CR001-01 derives health commercials and renewal-compatible annual premiums', () => {
    const row = parse({
      category: 'HEALTH',
      familySizeOrModel: 'INDIVIDUAL',
      businessType: 'FRESH',
      bookedOn: '02-07-2026',
      commencementDate: '02-07-2026',
      expiryDate: '01-07-2027',
      policyTerm: '1 YEAR',
      businessSource: 'IN HOUSE',
      premiumGross: '29466',
      premiumNet: '29466',
    });
    expect(row.problems).toEqual([]);
    expect(row.parsed?.commercials).toMatchObject({
      category: 'HEALTH_INDIVIDUAL',
      line: 'HEALTH',
      bookedOn: '2026-07-02',
      expiryDate: '2027-07-01',
      policyTermMonths: 12,
      businessSource: 'IN_HOUSE',
      premiumGrossPaise: 2946600,
      premiumTaxPaise: 0,
    });
  });
  it('AC-CR001-06 requires net premium for commission rows and rejects negative inferred tax', () => {
    const row = parse({ premiumNet: '', commissionAmount: '100' });
    expect(row.problems).toContain('premium_net_required');
    expect(parse({ premiumNet: '1200' }).problems).toContain('premium_mismatch');
  });
  it('AC-M07-07 normalizes mode aliases and distinguishes business warnings', () => {
    expect(['Yly', 'Hly', 'Qly', 'Mly', 'SSS'].map((mode) => parse({ mode }).parsed?.mode)).toEqual([
      'ANNUAL',
      'HALF_YEARLY',
      'QUARTERLY',
      'MONTHLY',
      'MONTHLY',
    ]);
    const row = parse({ businessSource: 'UNLISTED' });
    expect(row.problems).toEqual([]);
    expect(row.warnings).toEqual(['unknown_business_source']);
    expect(row.parsed?.commercials.businessSource).toBe('OTHER');
  });
  it('AC-M07-07 maps positional duplicate Remarks and typed custom column keys', () => {
    expect(suggestMapping(['Remarks', 'Remarks#2', 'custom:branch_code', 'risk:make', '%'])).toEqual({
      remarks: 'Remarks',
      commissionRemarks: 'Remarks#2',
      'custom:branch_code': 'custom:branch_code',
      'risk:make': 'risk:make',
      commissionRatePct: '%',
    });
    expect(parse({ 'custom:branch_code': 'DEL' }).parsed?.customFields).toEqual({ branch_code: 'DEL' });
  });
  it('AC-M07-08 freezes mapped rows after a committed chunk and retains progress for replay', async () => {
    const row = {
      policyNumber: 'PN1234',
      insurerName: 'Insurer',
      productName: 'Term',
      holderName: 'Asha',
      premium: '1000',
      commencementDate: '2026-01-01',
    };
    const batch = ImportBatch.upload({
      id: 'batch1',
      format: 'CSV_TEMPLATE',
      fileChecksum: 'checksum',
      asOf: '2026-10-03',
      rows: [row],
      now: new Date('2026-10-03T00:00:00Z'),
      ownerMemberId: 'm1',
    });
    batch.map(Object.fromEntries(Object.keys(row).map((key) => [key, key])));
    await batch.validate({ validate: () => [] }, { match: async () => ({ kind: 'NEW' }) });
    batch.finishRows([1], { imported: 1, updated: 0, skipped: 0, parties: { created: 1, linked: 0 } });
    expect(batch.readyToCommit()).toBe(true);
    expect(batch.props.rows[0].raw).toEqual({});
    expect(batch.props.rows[0].parsed).toBeUndefined();
    expect(() => batch.decide(1, 'SKIP')).toThrow('Import review is frozen');
    expect(() => batch.map({})).toThrow('Import review is frozen');
  });
});
