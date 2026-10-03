import { describe, it, expect } from '@jest/globals';
import { BusinessRuleError, ValidationError } from '../errors/domain-errors';
import { PolicyCommercials, PolicyCommercialsProps } from './policy-commercials';
import {
  HealthRiskV1,
  MotorRiskV1,
  checkRiskAgainstCommercials,
  createRiskSchemaRegistry,
  memberMix,
  riskSchemaFor,
} from './risk-details';

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected function to throw');
}

const registry = createRiskSchemaRegistry();

const motor = {
  registrationNo: 'MH12AB1234',
  registrationYear: 2020,
  make: 'Maruti',
  model: 'Swift',
  ncbPercent: 25,
  claimInPreviousYear: false,
  odPremiumPaise: 60_000,
  tpPremiumPaise: 40_000,
  addOns: ['ZERO_DEP'],
};

function motorIssues(payload: unknown): string[] {
  const error = thrown(() => registry.parse('motor', 1, payload)) as ValidationError;
  expect(error.code).toBe('schema_validation_failed');
  return error.errors.map((e) => e.path);
}

const commercials: PolicyCommercialsProps = {
  category: 'MOTOR',
  line: 'GENERAL',
  businessType: 'FRESH',
  bookedOn: '2026-10-03',
  commencementDate: '2026-10-04',
  expiryDate: '2027-10-03',
  premiumNetPaise: 100_000,
  premiumTaxPaise: 18_000,
  premiumGrossPaise: 118_000,
};

describe('AC-CR001-02 motor.v1 schema', () => {
  it('AC-CR001-02 registers motor, health and life at version 1', () => {
    expect(registry.has('motor', 1)).toBe(true);
    expect(registry.has('health', 1)).toBe(true);
    expect(registry.has('life', 1)).toBe(true);
    expect(registry.get('motor', 1).p2Paths).toEqual(['registrationNo']);
  });

  it('AC-CR001-02 accepts a valid payload and NCB 25', () => {
    const parsed = registry.parse<MotorRiskV1>('motor', 1, motor);
    expect(parsed.ncbPercent).toBe(25);
    expect(parsed.registrationNo).toBe('MH12AB1234');
  });

  it('AC-CR001-02 rejects NCB 30 at path ncbPercent', () => {
    expect(motorIssues({ ...motor, ncbPercent: 30 })).toEqual(['ncbPercent']);
  });

  it('AC-CR001-02 rejects claim in previous year with NCB 20, accepts NCB 0', () => {
    expect(motorIssues({ ...motor, claimInPreviousYear: true, ncbPercent: 20 })).toEqual(['ncbPercent']);
    const ok = registry.parse<MotorRiskV1>('motor', 1, { ...motor, claimInPreviousYear: true, ncbPercent: 0 });
    expect(ok.ncbPercent).toBe(0);
  });

  it('AC-CR001-02 normalises registration numbers', () => {
    expect(registry.parse<MotorRiskV1>('motor', 1, { ...motor, registrationNo: 'dl 3c ab 1234' }).registrationNo).toBe('DL3CAB1234');
    expect(registry.parse<MotorRiskV1>('motor', 1, { ...motor, registrationNo: 'mh-12-ab-1234' }).registrationNo).toBe('MH12AB1234');
  });

  it('AC-CR001-02 accepts BH series and rejects malformed numbers', () => {
    expect(registry.parse<MotorRiskV1>('motor', 1, { ...motor, registrationNo: '22BH1234AB' }).registrationNo).toBe('22BH1234AB');
    expect(motorIssues({ ...motor, registrationNo: '22BH1234ABC' })).toEqual(['registrationNo']);
    expect(motorIssues({ ...motor, registrationNo: '1234' })).toEqual(['registrationNo']);
  });

  it('AC-CR001-02 enforces year, premium and add-on bounds', () => {
    expect(motorIssues({ ...motor, registrationYear: 1949 })).toEqual(['registrationYear']);
    expect(motorIssues({ ...motor, registrationYear: 2101 })).toEqual(['registrationYear']);
    expect(motorIssues({ ...motor, odPremiumPaise: 10.5 })).toEqual(['odPremiumPaise']);
    expect(motorIssues({ ...motor, addOns: Array.from({ length: 21 }, () => 'X') })).toEqual(['addOns']);
  });
});

describe('AC-CR001-02 checkRiskAgainstCommercials motor', () => {
  const pc = PolicyCommercials.create(commercials);

  it('AC-CR001-02 OD + TP equal to net passes, net + 1 is refused', () => {
    expect(() => checkRiskAgainstCommercials('motor', { ...motor, odPremiumPaise: 60_000, tpPremiumPaise: 40_000 }, pc, '2026-10-03')).not.toThrow();
    const error = thrown(() =>
      checkRiskAgainstCommercials('motor', { ...motor, odPremiumPaise: 60_000, tpPremiumPaise: 40_001 }, pc, '2026-10-03'),
    ) as BusinessRuleError;
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.code).toBe('motor_premium_exceeds_net');
  });

  it('AC-CR001-02 future registration year is refused, current year accepted', () => {
    const future = thrown(() => checkRiskAgainstCommercials('motor', { ...motor, registrationYear: 2027 }, pc, '2026-10-03')) as BusinessRuleError;
    expect(future.code).toBe('registration_year_in_future');
    expect(() => checkRiskAgainstCommercials('motor', { ...motor, registrationYear: 2026 }, pc, '2026-10-03')).not.toThrow();
  });
});

describe('AC-CR001-07 health.v1, life.v1 and mapping', () => {
  const health: HealthRiskV1 = {
    coverType: 'FLOATER',
    members: [
      { relation: 'SELF', ageBand: '36-45' },
      { relation: 'SPOUSE', ageBand: '36-45' },
      { relation: 'SON', ageBand: '0-17' },
    ],
  };

  it('AC-CR001-07 floater needs at least two members at path members', () => {
    const error = thrown(() => registry.parse('health', 1, { ...health, members: [health.members[0]] })) as ValidationError;
    expect(error.errors.map((e) => e.path)).toEqual(['members']);
    expect(registry.parse<HealthRiskV1>('health', 1, { ...health, coverType: 'INDIVIDUAL', members: [health.members[0]] }).members).toHaveLength(1);
  });

  it('AC-CR001-07 rejects more than 12 members and invalid portability date', () => {
    const many = Array.from({ length: 13 }, () => ({ relation: 'OTHER', ageBand: '18-35' }));
    expect((thrown(() => registry.parse('health', 1, { ...health, members: many })) as ValidationError).errors[0].path).toBe('members');
    const bad = thrown(() =>
      registry.parse('health', 1, { ...health, portabilityFrom: { insurerName: 'Acme', continuousCoverSince: '2026-02-30' } }),
    ) as ValidationError;
    expect(bad.errors[0].path).toBe('portabilityFrom.continuousCoverSince');
  });

  it('AC-CR001-07 memberMix', () => {
    expect(memberMix(health.members)).toBe('2A+1C');
    expect(memberMix([{ relation: 'SELF', ageBand: '18-35' }, { relation: 'SPOUSE', ageBand: '71+' }])).toBe('2A');
    expect(memberMix([{ relation: 'SON', ageBand: '0-17' }, { relation: 'DAUGHTER', ageBand: '0-17' }])).toBe('0A+2C');
  });

  it('AC-CR001-07 life.v1 bounds', () => {
    expect(registry.parse('life', 1, { ppt: 10, riders: [] })).toEqual({ ppt: 10, riders: [] });
    expect((thrown(() => registry.parse('life', 1, { ppt: 101, riders: [] })) as ValidationError).errors[0].path).toBe('ppt');
    expect((thrown(() => registry.parse('life', 1, { ppt: 10, riders: Array.from({ length: 11 }, () => 'R') })) as ValidationError).errors[0].path).toBe('riders');
  });

  it('AC-CR001-07 riskSchemaFor maps categories to schema ids', () => {
    expect(riskSchemaFor('MOTOR')).toEqual({ id: 'motor', version: 1 });
    expect(riskSchemaFor('HEALTH_FLOATER')).toEqual({ id: 'health', version: 1 });
    expect(riskSchemaFor('STANDARD_HEALTH')).toEqual({ id: 'health', version: 1 });
    expect(riskSchemaFor('ULIP')).toEqual({ id: 'life', version: 1 });
    expect(riskSchemaFor('PERSONAL_ACCIDENT')).toBeUndefined();
    expect(riskSchemaFor('HOME')).toBeUndefined();
    expect(riskSchemaFor('OTHER')).toBeUndefined();
  });

  it('AC-CR001-07 health checks cover type vs category and portability details', () => {
    const floaterPc = PolicyCommercials.create({ ...commercials, category: 'HEALTH_FLOATER', line: 'HEALTH' });
    expect(() => checkRiskAgainstCommercials('health', health, floaterPc, '2026-10-03')).not.toThrow();
    const individualPc = PolicyCommercials.create({ ...commercials, category: 'HEALTH_INDIVIDUAL', line: 'HEALTH' });
    expect((thrown(() => checkRiskAgainstCommercials('health', health, individualPc, '2026-10-03')) as BusinessRuleError).code).toBe('cover_type_category_mismatch');
    const standardPc = PolicyCommercials.create({ ...commercials, category: 'STANDARD_HEALTH', line: 'HEALTH' });
    expect(() => checkRiskAgainstCommercials('health', { ...health, coverType: 'INDIVIDUAL' }, standardPc, '2026-10-03')).not.toThrow();
    const portPc = PolicyCommercials.create({
      ...commercials,
      category: 'HEALTH_FLOATER',
      line: 'HEALTH',
      businessType: 'PORTABILITY',
      previousInsurerName: 'Acme',
    });
    expect((thrown(() => checkRiskAgainstCommercials('health', health, portPc, '2026-10-03')) as BusinessRuleError).code).toBe('portability_details_required');
  });

  it('AC-CR001-07 life checks ppt against the policy term', () => {
    const lifePc = (months: number): PolicyCommercials =>
      PolicyCommercials.create({ ...commercials, category: 'TERM', line: 'LIFE', policyTermMonths: months });
    expect(() => checkRiskAgainstCommercials('life', { ppt: 10, riders: [] }, lifePc(120), '2026-10-03')).not.toThrow();
    expect((thrown(() => checkRiskAgainstCommercials('life', { ppt: 10, riders: [] }, lifePc(119), '2026-10-03')) as BusinessRuleError).code).toBe('ppt_exceeds_term');
  });
});
