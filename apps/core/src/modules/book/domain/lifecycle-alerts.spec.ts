import { LifecycleAlertEngine, SurvivalBenefitRule, AnniversaryRule, FreeLookEndRule, AgeChangeRule, BirthdayRule, MaturityRule } from './lifecycle-alerts';
import { ServicingRequest } from './servicing';
import { policy } from './test-fixture';

describe('AC-M07-06 lifecycle rules', () => {
  it('AC-M07-06 calculates maturity reminders and stable keys', () => {
    const result = new LifecycleAlertEngine().alertsBetween([policy({ maturityDate: '2026-06-01' })], [], '2026-03-01', '2026-05-02');
    expect(result.filter((a) => a.kind === 'MATURITY')).toEqual([
      { policyId: 'hp_1', kind: 'MATURITY', date: '2026-03-03', key: 'hp_1:MATURITY:2026-03-03' },
      { policyId: 'hp_1', kind: 'MATURITY', date: '2026-05-02', key: 'hp_1:MATURITY:2026-05-02' },
    ]);
  });
  it('AC-M07-06 skips unknown birthdays and never infers a day from DOB year', () => {
    const engine = new LifecycleAlertEngine();
    const result = engine.alertsBetween([policy()], [{ id: 'pty_1', dobYear: 1990 }], '2026-01-01', '2026-12-31');
    expect(result.filter((a) => ['BIRTHDAY', 'AGE_CHANGE'].includes(a.kind))).toEqual([]);
    const known = engine.alertsBetween([policy()], [{ id: 'pty_1', dobYear: 1990, birthday: '10-03' }], '2026-01-01', '2026-12-31');
    expect(known.filter((a) => ['BIRTHDAY', 'AGE_CHANGE'].includes(a.kind))).toEqual([
      { policyId: 'hp_1', kind: 'AGE_CHANGE', date: '2026-04-03', key: 'hp_1:AGE_CHANGE:2026-04-03' },
      { policyId: 'hp_1', kind: 'BIRTHDAY', date: '2026-10-03', key: 'hp_1:BIRTHDAY:2026-10-03' },
    ]);
  });
  it('AC-M07-06 clamps leap birthdays and uses platform free-look period', () => {
    const engine = new LifecycleAlertEngine();
    expect(engine.alertsBetween([policy({ source: 'PLATFORM_SALE' })], [{ id: 'pty_1', dobYear: 2000, birthday: '02-29' }], '2026-02-01', '2026-03-02')).toEqual([
      { policyId: 'hp_1', kind: 'BIRTHDAY', date: '2026-02-28', key: 'hp_1:BIRTHDAY:2026-02-28' },
      { policyId: 'hp_1', kind: 'FREE_LOOK_END', date: '2026-03-02', key: 'hp_1:FREE_LOOK_END:2026-03-02' },
    ]);
  });
  it('AC-M07-06 emits configured survival benefits only in eligible years', () => {
    const rule = new SurvivalBenefitRule(() => [1, 3]);
    expect(rule.occursOn(policy(), [], 2026)).toBeUndefined();
    expect(rule.occursOn(policy(), [], 2027)).toBe('2027-01-31');
    const engine = new LifecycleAlertEngine([rule]);
    expect(engine.alertsBetween([policy()], [], '2027-01-01', '2027-02-01')).toEqual([
      { policyId: 'hp_1', kind: 'SURVIVAL_BENEFIT', date: '2027-01-31', key: 'hp_1:SURVIVAL_BENEFIT:2027-01-31' },
    ]);
  });
  it('AC-M07-06 has no anniversary on commencement and a fifteen-day manual free look', () => {
    expect(new AnniversaryRule().occursOn(policy(), [], 2026)).toBeUndefined();
    expect(new AnniversaryRule().occursOn(policy(), [], 2027)).toBe('2027-01-31');
    expect(new FreeLookEndRule().occursOn(policy(), [], 2026)).toBe('2026-02-15');
    expect(new FreeLookEndRule().occursOn(policy({ distanceSale: true }), [], 2026)).toBe('2026-03-02');
    expect(new MaturityRule().occursOn(policy({ maturityDate: '2027-01-31' }), [], 2026)).toBeUndefined();
  });
  it('AC-M07-06 handles age-change in the year before a first-half birthday', () => {
    expect(new AgeChangeRule().occursOn(policy(), [{ id: 'pty_1', dobYear: 1990, birthday: '02-28' }], 2026)).toBe('2026-08-28');
    expect(new AgeChangeRule().occursOn(policy(), [{ id: 'pty_1', dobYear: 2030, birthday: '10-03' }], 2026)).toBeUndefined();
    expect(() => new BirthdayRule().occursOn(policy(), [{ id: 'pty_1', birthday: '02-30' }], 2026)).toThrow();
  });
});

describe('AC-M07-12 servicing state and sensitive notes', () => {
  const create = () => ServicingRequest.create({ id: 'srv_1', heldPolicyId: 'hp_1', kind: 'CLAIM', now: new Date('2026-01-31Z') });
  it('AC-M07-12 rejects direct resolution and terminal reopening', () => {
    const request = create();
    expect(() => request.transition('RESOLVED')).toThrow();
    request.transition('SUBMITTED_TO_INSURER');
    request.transition('AWAITING_CUSTOMER');
    request.transition('SUBMITTED_TO_INSURER');
    request.transition('RESOLVED');
    expect(request.props.status).toBe('RESOLVED');
    expect(() => request.transition('OPEN')).toThrow();
  });
  it.each(['ABCDE1234F', '1234 5678 9012', '1234 5678 9012 3456'])('AC-M07-12 refuses sensitive note %s', (text) => {
    expect(() => create().addNote(text, 'mem_1', new Date('2026-01-31Z'))).toThrow('Sensitive content');
  });
  it('AC-M07-12 records authored notes and rejects insecure portal links', () => {
    const request = create();
    request.addNote('Documents received', 'mem_1', new Date('2026-01-31Z'));
    expect(request.props.notes).toEqual([{ at: '2026-01-31T00:00:00.000Z', by: 'mem_1', text: 'Documents received' }]);
    expect(() => request.update({ portalUrl: 'http://insurer.example' })).toThrow();
  });
  it('AC-M07-12 validates followups and references and preserves restored notes', () => {
    const request = create();
    request.update({ followUpOn: '2026-02-01', insurerRef: 'REF-1', portalUrl: 'https://insurer.example/claims' });
    request.setFollowUp(undefined);
    request.transition('SUBMITTED_TO_INSURER'); request.transition('REJECTED'); request.transition('REJECTED');
    request.markSaved();
    expect(ServicingRequest.restore(request.props).props).toMatchObject({ version: 2, insurerRef: 'REF-1', status: 'REJECTED', followUpOn: undefined });
    expect(() => request.update({ portalUrl: 'invalid' })).toThrow('HTTPS');
    expect(() => request.update({ insurerRef: 'x'.repeat(121) })).toThrow('too long');
    expect(() => request.setFollowUp('2026-02-30')).toThrow();
    expect(() => request.addNote(' ', 'member', new Date())).toThrow('1 to 1000');
  });
});
