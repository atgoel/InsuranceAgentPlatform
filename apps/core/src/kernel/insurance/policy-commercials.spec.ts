import { describe, it, expect } from '@jest/globals';
import { BusinessRuleError, ValidationError } from '../errors/domain-errors';
import {
  PolicyCommercials,
  PolicyCommercialsProps,
  businessSourceForLeadSource,
  lineOfCategory,
} from './policy-commercials';

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected function to throw');
}

const base: PolicyCommercialsProps = {
  category: 'MOTOR',
  line: 'GENERAL',
  businessType: 'FRESH',
  bookedOn: '2026-10-03',
  commencementDate: '2026-10-04',
  expiryDate: '2027-07-01',
  premiumNetPaise: 100_000,
  premiumTaxPaise: 18_000,
  premiumGrossPaise: 118_000,
};

function fieldCodes(input: PolicyCommercialsProps): string[] {
  const error = thrown(() => PolicyCommercials.create(input)) as ValidationError;
  expect(error).toBeInstanceOf(ValidationError);
  expect(error.code).toBe('invalid_policy_commercials');
  return error.errors.map((e) => `${e.path}:${e.code}`);
}

describe('AC-CR001-03 PolicyCommercials', () => {
  it('AC-CR001-03 creates a valid record and exposes props', () => {
    const pc = PolicyCommercials.create(base);
    expect(pc.props.premiumGrossPaise).toBe(118_000);
    expect(pc.bookingMonth()).toBe('2026-10');
  });

  it('AC-CR001-03 renewal date is expiry + 1 day for GENERAL and HEALTH', () => {
    expect(PolicyCommercials.create(base).renewalDate()).toBe('2027-07-02');
    const leap = PolicyCommercials.create({ ...base, expiryDate: '2028-02-28' });
    expect(leap.renewalDate()).toBe('2028-02-29');
    const health = PolicyCommercials.create({ ...base, category: 'HEALTH_INDIVIDUAL', line: 'HEALTH' });
    expect(health.renewalDate()).toBe('2027-07-02');
  });

  it('AC-CR001-03 renewal date is undefined for LIFE or without expiry', () => {
    const life = PolicyCommercials.create({ ...base, category: 'TERM', line: 'LIFE', policyTermMonths: 240 });
    expect(life.renewalDate()).toBeUndefined();
    const noExpiry = PolicyCommercials.create({ ...base, expiryDate: undefined });
    expect(noExpiry.renewalDate()).toBeUndefined();
  });

  it('AC-CR001-03 rejects net + tax != gross', () => {
    expect(fieldCodes({ ...base, premiumGrossPaise: 118_001 })).toEqual(['premiumGrossPaise:premium_mismatch']);
  });

  it('AC-CR001-03 rejects non-integer, negative and unsafe premiums', () => {
    expect(fieldCodes({ ...base, premiumNetPaise: 100.5 })).toEqual(['premiumNetPaise:premium_not_integer']);
    expect(fieldCodes({ ...base, premiumTaxPaise: -1 })).toEqual(['premiumTaxPaise:premium_not_integer']);
    expect(fieldCodes({ ...base, premiumGrossPaise: Number.MAX_SAFE_INTEGER + 1 })).toEqual([
      'premiumGrossPaise:premium_not_integer',
    ]);
  });

  it('AC-CR001-03 rejects category/line mismatch but accepts OTHER on any line', () => {
    expect(fieldCodes({ ...base, line: 'LIFE' })).toEqual(['line:category_line_mismatch']);
    expect(PolicyCommercials.create({ ...base, category: 'OTHER', line: 'LIFE' }).props.line).toBe('LIFE');
    expect(lineOfCategory('OTHER')).toBeUndefined();
    expect(lineOfCategory('PERSONAL_ACCIDENT')).toBe('HEALTH');
    expect(lineOfCategory('CHILD')).toBe('LIFE');
  });

  it('AC-CR001-03 PORTABILITY only on HEALTH, ROLLOVER only on GENERAL', () => {
    expect(fieldCodes({ ...base, businessType: 'PORTABILITY', previousInsurerName: 'Acme' })).toEqual([
      'businessType:business_type_line_mismatch',
    ]);
    expect(
      fieldCodes({ ...base, category: 'HEALTH_FLOATER', line: 'HEALTH', businessType: 'ROLLOVER', previousInsurerName: 'Acme' }),
    ).toEqual(['businessType:business_type_line_mismatch']);
    const ok = PolicyCommercials.create({
      ...base,
      category: 'HEALTH_FLOATER',
      line: 'HEALTH',
      businessType: 'PORTABILITY',
      previousInsurerName: 'Acme',
    });
    expect(ok.props.businessType).toBe('PORTABILITY');
  });

  it('AC-CR001-03 PORTABILITY and ROLLOVER require the previous insurer', () => {
    expect(fieldCodes({ ...base, businessType: 'ROLLOVER' })).toEqual(['previousInsurerName:previous_insurer_required']);
    expect(fieldCodes({ ...base, businessType: 'ROLLOVER', previousInsurerName: '   ' })).toEqual([
      'previousInsurerName:previous_insurer_required',
    ]);
  });

  it('AC-CR001-03 validates real calendar dates', () => {
    expect(fieldCodes({ ...base, commencementDate: '2026-02-30' })).toEqual(['commencementDate:invalid_date']);
    expect(fieldCodes({ ...base, bookedOn: '03-10-2026' })).toEqual(['bookedOn:invalid_date']);
    expect(fieldCodes({ ...base, expiryDate: '2027-13-01' })).toEqual(['expiryDate:invalid_date']);
  });

  it('AC-CR001-03 expiry before start is rejected, same day accepted', () => {
    expect(fieldCodes({ ...base, expiryDate: '2026-10-03' })).toEqual(['expiryDate:expiry_before_start']);
    expect(PolicyCommercials.create({ ...base, expiryDate: '2026-10-04' }).props.expiryDate).toBe('2026-10-04');
  });

  it('AC-CR001-03 policy term must be an integer 1..1200', () => {
    expect(fieldCodes({ ...base, policyTermMonths: 0 })).toEqual(['policyTermMonths:invalid_term']);
    expect(fieldCodes({ ...base, policyTermMonths: 1201 })).toEqual(['policyTermMonths:invalid_term']);
    expect(fieldCodes({ ...base, policyTermMonths: 12.5 })).toEqual(['policyTermMonths:invalid_term']);
    expect(PolicyCommercials.create({ ...base, policyTermMonths: 1200 }).props.policyTermMonths).toBe(1200);
  });

  it('AC-CR001-03 validates referrer, remarks and booking channel lengths', () => {
    expect(fieldCodes({ ...base, referredBy: { name: '   ' } })).toEqual(['referredBy.name:invalid_referrer']);
    expect(fieldCodes({ ...base, referredBy: { name: 'x'.repeat(121) } })).toEqual(['referredBy.name:invalid_referrer']);
    expect(fieldCodes({ ...base, remarks: 'r'.repeat(1001) })).toEqual(['remarks:remarks_too_long']);
    expect(fieldCodes({ ...base, bookingChannelCode: 'c'.repeat(61) })).toEqual(['bookingChannelCode:booking_channel_too_long']);
    expect(PolicyCommercials.create({ ...base, referredBy: { name: '  Ravi  ' } }).props.referredBy).toEqual({ name: 'Ravi' });
  });

  it('AC-CR001-03 collects every problem before throwing', () => {
    const codes = fieldCodes({
      ...base,
      line: 'LIFE',
      premiumGrossPaise: 1,
      commencementDate: '2026-02-30',
      businessType: 'ROLLOVER',
    });
    expect(codes).toEqual([
      'premiumGrossPaise:premium_mismatch',
      'line:category_line_mismatch',
      'businessType:business_type_line_mismatch',
      'previousInsurerName:previous_insurer_required',
      'commencementDate:invalid_date',
    ]);
  });

  it('AC-CR001-03 remarks with a PAN are refused as sensitive_content_not_allowed', () => {
    const error = thrown(() => PolicyCommercials.create({ ...base, remarks: 'PAN ABCDE1234F' })) as BusinessRuleError;
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.code).toBe('sensitive_content_not_allowed');
  });

  it('AC-CR001-03 maps lead sources to business sources', () => {
    expect(businessSourceForLeadSource('REFERRAL')).toBe('REFERRAL');
    expect(businessSourceForLeadSource('WALK_IN')).toBe('WALK_IN');
    expect(businessSourceForLeadSource('MICROSITE')).toBe('DIGITAL');
    expect(businessSourceForLeadSource('EVENT')).toBe('CAMPAIGN');
    expect(businessSourceForLeadSource('IMPORT')).toBe('IN_HOUSE');
    expect(businessSourceForLeadSource('toString')).toBe('OTHER');
    expect(businessSourceForLeadSource('SOMETHING')).toBe('OTHER');
  });
});
