import { HeldPolicy } from './held-policy';
import { policy } from './test-fixture';
import { PolicyCommercialsProps } from '../../../kernel/insurance/policy-commercials';

const now = new Date('2026-07-02T00:00:00Z');
const health = () => {
  const base = policy();
  return {
    ...base,
    line: 'HEALTH' as const,
    mode: 'ANNUAL' as const,
    renewalDate: '2027-07-02',
    nextDueDate: undefined,
    commercials: { ...base.commercials, line: 'HEALTH' as const, category: 'HEALTH_INDIVIDUAL' as const, expiryDate: '2027-07-01' },
  };
};

describe('AC-M07-01 registration and safe risk', () => {
  it('AC-M07-01 derives read aliases and health renewal from commercials', () => {
    const h = HeldPolicy.register({ ...health(), now });
    expect(h.props).toMatchObject({ premiumPaise: 10000, renewalDate: '2027-07-02', createdAt: now.toISOString(), version: 1 });
    h.markSaved();
    expect(h.props.version).toBe(2);
  });
  it.each(['2026-02-30', 'not-a-date'])('AC-M07-01 rejects invalid as-of %s', (asOf) => {
    expect(() => HeldPolicy.register({ ...policy({ asOf }), now })).toThrow('Expected a real');
  });
  it('AC-M07-01 rejects line conflicts, bad sums and pre-commencement due', () => {
    expect(() => HeldPolicy.register({ ...policy({ line: 'GENERAL', mode: 'ANNUAL' }), now })).toThrow('Line must match');
    expect(() => HeldPolicy.register({ ...policy({ sumAssuredPaise: -1 }), now })).toThrow('Sum assured');
    expect(() => HeldPolicy.register({ ...policy({ nextDueDate: '2025-12-30' }), now })).toThrow('Due cannot precede');
  });
  it('AC-CR001-02 validates motor schema and OD/TP against net before storing safe risk', () => {
    const base = policy();
    const input = {
      ...base,
      line: 'GENERAL' as const,
      mode: 'ANNUAL' as const,
      commercials: { ...base.commercials, category: 'MOTOR' as const, line: 'GENERAL' as const },
      risk: {
        schemaId: 'motor',
        schemaVersion: 1,
        details: {
          registrationNo: 'DL01AB1234',
          registrationYear: 2020,
          make: 'Make',
          model: 'Model',
          ncbPercent: 20,
          claimInPreviousYear: false,
          odPremiumPaise: 5000,
          tpPremiumPaise: 3000,
          addOns: [],
        },
      },
      now,
    };
    expect(HeldPolicy.register(input).props.risk?.schemaId).toBe('motor');
    expect(() =>
      HeldPolicy.register({ ...input, risk: { ...input.risk, details: { ...input.risk.details, odPremiumPaise: 11000 } } }),
    ).toThrow('exceeds the net');
    expect(() => HeldPolicy.register({ ...input, risk: { schemaId: 'health', schemaVersion: 1, details: {} } })).toThrow('Risk schema');
    const safe = { ...input.risk.details };
    delete (safe as { registrationNo?: string }).registrationNo;
    const held = HeldPolicy.register({
      ...input,
      risk: { ...input.risk, details: safe },
      registrationNoEnc: 'cipher',
      registrationNoHash: 'hash',
      registrationNoLast4: '1234',
    });
    expect(held.props.risk?.details).toEqual(safe);
  });
  it('AC-M07-01 rejects risk without required encrypted registration fields', () => {
    const base = policy();
    expect(() =>
      HeldPolicy.register({
        ...base,
        line: 'GENERAL',
        mode: 'ANNUAL',
        commercials: { ...base.commercials, category: 'MOTOR', line: 'GENERAL' },
        risk: { schemaId: 'motor', schemaVersion: 1, details: {} },
        now,
      }),
    ).toThrow('Payload does not match');
  });
});

describe('AC-M07-02 AC-M07-05 policy mutation invariants', () => {
  it('AC-M07-02 allows grace, lapse, revival, paid-up and ignores equal dates', () => {
    const held = HeldPolicy.restore(policy());
    held.updateStatusFromSource('GRACE', '2026-03-01', 'IMPORT');
    held.updateStatusFromSource('LAPSED', '2026-03-02', 'IMPORT');
    held.updateStatusFromSource('IN_FORCE', '2026-03-03', 'MANUAL');
    expect(held.props.status).toBe('IN_FORCE');
    expect(() => held.updateStatusFromSource('PAID_UP', '2026-03-04', 'IMPORT')).toThrow('Illegal policy');
    held.updateStatusFromSource('GRACE', '2026-03-04', 'IMPORT');
    held.updateStatusFromSource('LAPSED', '2026-03-05', 'IMPORT');
    held.updateStatusFromSource('PAID_UP', '2026-03-06', 'IMPORT');
    held.updateStatusFromSource('IN_FORCE', '2026-03-06', 'MANUAL');
    expect(held.props.status).toBe('PAID_UP');
  });
  it('AC-M07-05 refuses future, expired revival and SINGLE payments', () => {
    expect(() => HeldPolicy.restore(policy()).recordPayment('2026-02-28', '2026-07-03', now)).toThrow('future');
    expect(() => HeldPolicy.restore(policy()).recordPayment('2026-02-28', '2031-03-01', new Date('2031-03-01Z'))).toThrow('Revival window');
    expect(() => HeldPolicy.restore(policy({ mode: 'SINGLE' })).recordPayment('2026-02-28', '2026-03-01', now)).toThrow('next unpaid');
  });
  it('AC-M07-05 preserves annual expiry/renewal invariant on payment and renewal', () => {
    const held = HeldPolicy.restore(health());
    held.recordPayment('2027-07-02', '2027-07-02', new Date('2027-07-02Z'));
    expect(held.props).toMatchObject({ renewalDate: '2028-07-02', commercials: { expiryDate: '2028-07-01' } });
    held.renew('2029-07-02', 20000, new Date('2028-07-02Z'));
    expect(held.props).toMatchObject({
      renewalDate: '2029-07-02',
      premiumPaise: 20000,
      commercials: { premiumNetPaise: 20000, expiryDate: '2029-07-01' },
    });
  });
  it.each(['CANCELLED', 'MATURED', 'EXPIRED'] as const)('AC-M07-02 refuses renewal from terminal %s', (status) => {
    expect(() => HeldPolicy.restore({ ...health(), status }).renew('2028-07-02', 10000, now)).toThrow('Closed policies');
  });
  it('AC-M07-02 rejects invalid renewal date, premium and life renewal', () => {
    expect(() => HeldPolicy.restore(policy()).renew('2028-07-02', 10000, now)).toThrow('annual health');
    expect(() => HeldPolicy.restore(health()).renew('2026-07-02', 10000, now)).toThrow('advance');
    expect(() => HeldPolicy.restore(health()).renew('2028-07-02', 1.5, now)).toThrow('integer paise');
    const h = health();
    expect(() =>
      HeldPolicy.restore({ ...h, commercials: { ...h.commercials, premiumTaxPaise: 1000, premiumNetPaise: 9000 } }).renew(
        '2028-07-02',
        500,
        now,
      ),
    ).toThrow('less than tax');
  });
  it('AC-CR001-04 updates descriptive fields without mutating the caller', () => {
    const held = HeldPolicy.restore(policy());
    held.assignServicing('mem_2', 'org_2');
    held.relinkProposer('other', 'pty_2');
    held.relinkProposer('pty_1', 'pty_2');
    held.replaceCustomFields({ branch_code: 'DEL' });
    const commercials: PolicyCommercialsProps = { ...held.props.commercials, premiumNetPaise: 20000, premiumGrossPaise: 20000 };
    held.replaceCommercials(commercials);
    held.replaceRisk(undefined);
    expect(held.props).toMatchObject({
      servicingMemberId: 'mem_2',
      orgUnitId: 'org_2',
      proposerPartyId: 'pty_2',
      premiumPaise: 20000,
      customFields: { branch_code: 'DEL' },
    });
    expect(() => held.replaceCommercials({ ...commercials, line: 'GENERAL', category: 'MOTOR' })).toThrow('line cannot change');
    const snapshot = held.props;
    snapshot.customFields.branch_code = 'BAD';
    expect(held.props.customFields).toEqual({ branch_code: 'DEL' });
  });
});
