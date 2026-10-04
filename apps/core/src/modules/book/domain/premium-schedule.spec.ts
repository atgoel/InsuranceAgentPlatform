import { addMonthsClamped, scheduleFrom } from './premium-schedule';
import { HeldPolicy } from './held-policy';
import { DueEngine } from './due-engine';
import { LIFE_GRACE } from './premium-schedule';
import { policy } from './test-fixture';

describe('AC-M07-03 premium schedules', () => {
  it('AC-M07-03 clamps February but preserves the commencement day in March', () => {
    expect(scheduleFrom(policy(), '2026-02-01', 3)).toEqual([
      { dueDate: '2026-02-28', amountPaise: 10000 }, { dueDate: '2026-03-31', amountPaise: 10000 }, { dueDate: '2026-04-30', amountPaise: 10000 },
    ]);
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
  });
  it.each([['ANNUAL', '2027-01-31'], ['HALF_YEARLY', '2026-07-31'], ['QUARTERLY', '2026-04-30']] as const)('AC-M07-03 generates %s installments', (mode, next) => {
    expect(scheduleFrom(policy({ mode, nextDueDate: '2026-01-31' }), '2026-02-01', 1)).toEqual([{ dueDate: next, amountPaise: 10000 }]);
  });
  it('AC-M07-03 SINGLE has no dues after commencement', () => {
    expect(scheduleFrom(policy({ mode: 'SINGLE' }), '2026-02-01', 12)).toEqual([]);
  });
  it('AC-M07-03 stops at maturity and paying term, handles empty/count and distant windows', () => {
    expect(scheduleFrom(policy({ nextDueDate: undefined }), '2026-01-31', 12)).toEqual([]);
    expect(scheduleFrom(policy(), '2026-01-31', 0)).toEqual([]);
    expect(() => scheduleFrom(policy(), '2026-01-31', -1)).toThrow();
    expect(scheduleFrom(policy({ maturityDate: '2026-03-01' }), '2026-02-01', 12)).toEqual([{ dueDate: '2026-02-28', amountPaise: 10000 }]);
    expect(scheduleFrom(policy({ premiumPayingTermYears: 1 }), '2027-01-01', 12)).toEqual([]);
    expect(scheduleFrom(policy(), '2030-04-01', 1)).toEqual([{ dueDate: '2030-04-30', amountPaise: 10000 }]);
  });
});

describe('AC-M07-04 due boundaries', () => {
  const engine = new DueEngine(LIFE_GRACE);
  it.each([['2026-02-27', 'UPCOMING'], ['2026-02-28', 'DUE_TODAY'], ['2026-03-15', 'IN_GRACE'], ['2026-03-16', 'REVIVABLE'], ['2031-02-28', 'REVIVABLE'], ['2031-03-01', 'LAPSED']] as const)('AC-M07-04 classifies monthly due on %s as %s', (today, status) => {
    expect(engine.classify(policy(), today).status).toBe(status);
  });
  it('AC-M07-04 annual life has thirty grace days', () => {
    expect(engine.classify(policy({ mode: 'ANNUAL' }), '2026-03-30')).toMatchObject({ status: 'IN_GRACE', graceEndsOn: '2026-03-30' });
    expect(engine.classify(policy({ mode: 'ANNUAL' }), '2026-03-31').status).toBe('REVIVABLE');
  });
  it('AC-M07-04 distinguishes health grace from general expiry', () => {
    const health = policy({ line: 'HEALTH', renewalDate: '2026-07-02', mode: 'ANNUAL' });
    expect(engine.classify(health, '2026-05-18').status).toBe('RENEWAL_DUE');
    expect(engine.classify(health, '2026-05-17').status).toBe('UPCOMING');
    expect(engine.classify(health, '2026-08-01').status).toBe('IN_GRACE');
    expect(engine.classify(health, '2026-08-02').status).toBe('LAPSED');
    expect(engine.classify({ ...health, line: 'GENERAL' }, '2026-07-03').status).toBe('LAPSED');
  });
  it('AC-M07-04 excludes paid-up/single/missing dues and orders windows', () => {
    expect(engine.classify(policy({ status: 'PAID_UP' }), '2026-03-01')).toEqual({ status: 'PAID' });
    expect(engine.classify(policy({ mode: 'SINGLE' }), '2026-03-01')).toEqual({ status: 'PAID' });
    expect(engine.classify(policy({ nextDueDate: undefined }), '2026-03-01')).toEqual({ status: 'PAID' });
    expect(engine.window([policy({ status: 'MATURED' }), policy({ id: 'hp_2', nextDueDate: '2026-01-31' })], '2026-02-01', '2026-04-01')).toEqual([
      { policyId: 'hp_2', dueDate: '2026-02-28', status: 'DUE_TODAY', amountPaise: 10000 },
      { policyId: 'hp_2', dueDate: '2026-03-31', status: 'DUE_TODAY', amountPaise: 10000 },
    ]);
    const h = policy({ line: 'HEALTH', mode: 'ANNUAL', renewalDate: '2026-07-02' });
    expect(engine.window([h], '2026-07-01', '2026-07-31')).toEqual([{ policyId: 'hp_1', dueDate: '2026-07-02', status: 'RENEWAL_DUE', amountPaise: 10000 }]);
  });
});

describe('AC-M07-01 AC-M07-02 AC-M07-05 held policy state', () => {
  it('AC-M07-01 rejects incompatible modes, reversed maturity and fractional premiums', () => {
    expect(() => HeldPolicy.register({ ...policy({ line: 'HEALTH' }), now: new Date('2026-01-31Z') })).toThrow();
    expect(() => HeldPolicy.register({ ...policy({ maturityDate: '2025-12-31' }), now: new Date('2026-01-31Z') })).toThrow();
    const p = policy();
    expect(() => HeldPolicy.register({ ...p, commercials: { ...p.commercials, premiumGrossPaise: 0.5 }, now: new Date('2026-01-31Z') })).toThrow();
  });
  it('AC-M07-02 ignores older source status and enforces payment transitions', () => {
    const held = HeldPolicy.restore(policy());
    held.updateStatusFromSource('GRACE', '2026-01-30', 'IMPORT');
    expect(held.props.status).toBe('IN_FORCE');
    held.updateStatusFromSource('MATURED', '2026-03-01', 'IMPORT');
    expect(() => held.recordPayment('2026-02-28', '2026-03-02', new Date('2026-03-02Z'))).toThrow();
    held.updateStatusFromSource('IN_FORCE', '2026-03-02', 'IMPORT');
    expect(held.props.status).toBe('IN_FORCE');
  });
  it('AC-M07-05 advances a clamped due and revives within the window', () => {
    const held = HeldPolicy.restore(policy({ status: 'LAPSED' }));
    held.recordPayment('2026-02-28', '2026-03-20', new Date('2026-03-20Z'));
    expect(held.props).toMatchObject({ nextDueDate: '2026-03-31', status: 'IN_FORCE', statusAsOf: '2026-03-20' });
    expect(() => held.recordPayment('2026-02-28', '2026-03-20', new Date('2026-03-20Z'))).toThrow();
  });
});
