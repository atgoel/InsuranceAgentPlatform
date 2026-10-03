import { addDays } from '../domain/ist';
import { SensitiveContentGuard } from '../domain/sensitive-content';
import { FieldError, ValidationError } from '../errors/domain-errors';

export const POLICY_CATEGORIES = [
  'TERM', 'SAVINGS', 'ULIP', 'PENSION', 'CHILD', 'HEALTH_INDIVIDUAL', 'HEALTH_FLOATER', 'STANDARD_HEALTH',
  'PERSONAL_ACCIDENT', 'MOTOR', 'TRAVEL', 'HOME', 'COMMERCIAL', 'OTHER',
] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];
export type PolicyLine = 'LIFE' | 'HEALTH' | 'GENERAL';

const LINE_BY_CATEGORY: Record<PolicyCategory, PolicyLine | undefined> = {
  TERM: 'LIFE', SAVINGS: 'LIFE', ULIP: 'LIFE', PENSION: 'LIFE', CHILD: 'LIFE',
  HEALTH_INDIVIDUAL: 'HEALTH', HEALTH_FLOATER: 'HEALTH', STANDARD_HEALTH: 'HEALTH', PERSONAL_ACCIDENT: 'HEALTH',
  MOTOR: 'GENERAL', TRAVEL: 'GENERAL', HOME: 'GENERAL', COMMERCIAL: 'GENERAL',
  OTHER: undefined,
};

export function lineOfCategory(category: PolicyCategory): PolicyLine | undefined {
  return LINE_BY_CATEGORY[category];
}

export const BUSINESS_TYPES = ['FRESH', 'RENEWAL', 'PORTABILITY', 'ROLLOVER'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const BUSINESS_SOURCES = ['IN_HOUSE', 'REFERRAL', 'POSP', 'WALK_IN', 'DIGITAL', 'CAMPAIGN', 'OTHER'] as const;
export type BusinessSource = (typeof BUSINESS_SOURCES)[number];

const SOURCE_BY_LEAD_SOURCE: Record<string, BusinessSource> = {
  REFERRAL: 'REFERRAL', WALK_IN: 'WALK_IN',
  WEB_FORM: 'DIGITAL', MICROSITE: 'DIGITAL', API: 'DIGITAL',
  CAMPAIGN: 'CAMPAIGN', EVENT: 'CAMPAIGN',
  PHONE: 'IN_HOUSE', IMPORT: 'IN_HOUSE',
};

export function businessSourceForLeadSource(source: string): BusinessSource {
  return Object.prototype.hasOwnProperty.call(SOURCE_BY_LEAD_SOURCE, source) ? SOURCE_BY_LEAD_SOURCE[source] : 'OTHER';
}

export interface ReferredBy { name: string; partyId?: string; memberId?: string }

export interface PolicyCommercialsProps {
  category: PolicyCategory;
  line: PolicyLine;
  businessType: BusinessType;
  previousInsurerName?: string;
  bookedOn: string;
  commencementDate: string;
  expiryDate?: string;
  policyTermMonths?: number;
  premiumNetPaise: number;
  premiumTaxPaise: number;
  premiumGrossPaise: number;
  bookingChannelCode?: string;
  businessSource?: BusinessSource;
  referredBy?: ReferredBy;
  remarks?: string;
}

function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isPaise(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

type Collector = (path: string, code: string, message: string) => void;

function checkPremiums(input: PolicyCommercialsProps, add: Collector): void {
  const premiums: Array<['premiumNetPaise' | 'premiumTaxPaise' | 'premiumGrossPaise', number]> = [
    ['premiumNetPaise', input.premiumNetPaise],
    ['premiumTaxPaise', input.premiumTaxPaise],
    ['premiumGrossPaise', input.premiumGrossPaise],
  ];
  const invalid = premiums.filter(([, amount]) => !isPaise(amount));
  for (const [path] of invalid) add(path, 'premium_not_integer', 'Premium must be a non-negative integer in paise');
  if (invalid.length === 0 && input.premiumNetPaise + input.premiumTaxPaise !== input.premiumGrossPaise) {
    add('premiumGrossPaise', 'premium_mismatch', 'Net premium plus tax must equal gross premium');
  }
}

function checkDates(input: PolicyCommercialsProps, add: Collector): void {
  const dates: Array<['bookedOn' | 'commencementDate' | 'expiryDate', string | undefined]> = [
    ['bookedOn', input.bookedOn],
    ['commencementDate', input.commencementDate],
    ['expiryDate', input.expiryDate],
  ];
  const valid = new Set<string>();
  for (const [path, value] of dates) {
    if (value === undefined && path === 'expiryDate') continue;
    if (isRealDate(value)) valid.add(path);
    else add(path, 'invalid_date', `${path} must be a real YYYY-MM-DD date`);
  }
  if (valid.has('commencementDate') && valid.has('expiryDate') && (input.expiryDate as string) < input.commencementDate) {
    add('expiryDate', 'expiry_before_start', 'expiryDate must not be before commencementDate');
  }
}

function checkClassification(input: PolicyCommercialsProps, add: Collector): void {
  const expectedLine = lineOfCategory(input.category);
  if (expectedLine !== undefined && expectedLine !== input.line) {
    add('line', 'category_line_mismatch', `Category ${input.category} belongs to the ${expectedLine} line`);
  }
  checkBusinessType(input, add);
}

function checkBusinessType(input: PolicyCommercialsProps, add: Collector): void {
  const term = input.policyTermMonths;
  if (term !== undefined && (!Number.isInteger(term) || term < 1 || term > 1200)) {
    add('policyTermMonths', 'invalid_term', 'policyTermMonths must be an integer from 1 to 1200');
  }
  const requiredLine: Partial<Record<BusinessType, PolicyLine>> = { PORTABILITY: 'HEALTH', ROLLOVER: 'GENERAL' };
  const needed = requiredLine[input.businessType];
  if (needed !== undefined) {
    if (input.line !== needed) {
      add('businessType', 'business_type_line_mismatch', `${input.businessType} applies only to the ${needed} line`);
    }
    if (input.previousInsurerName === undefined || input.previousInsurerName.trim().length === 0) {
      add('previousInsurerName', 'previous_insurer_required', 'Previous insurer is required for portability or rollover');
    }
  }
}

function checkLengths(input: PolicyCommercialsProps, add: Collector): void {
  if ((input.remarks?.length ?? 0) > 1000) add('remarks', 'remarks_too_long', 'Remarks must be at most 1000 characters');
  if ((input.bookingChannelCode?.length ?? 0) > 60) {
    add('bookingChannelCode', 'booking_channel_too_long', 'Booking channel must be at most 60 characters');
  }
}

function checkFreeText(input: PolicyCommercialsProps, add: Collector): ReferredBy | undefined {
  let referredBy: ReferredBy | undefined;
  if (input.referredBy !== undefined) {
    const name = typeof input.referredBy.name === 'string' ? input.referredBy.name.trim() : '';
    if (name.length === 0 || name.length > 120) add('referredBy.name', 'invalid_referrer', 'Referrer name must be 1 to 120 characters');
    referredBy = { ...input.referredBy, name };
  }
  checkLengths(input, add);
  return referredBy;
}

export class PolicyCommercials {
  private constructor(private readonly value: PolicyCommercialsProps) {}

  static create(input: PolicyCommercialsProps): PolicyCommercials {
    const errors: FieldError[] = [];
    const add: Collector = (path, code, message) => {
      errors.push({ path, code, message });
    };
    checkPremiums(input, add);
    checkClassification(input, add);
    checkDates(input, add);
    const referredBy = checkFreeText(input, add);
    if (errors.length > 0) {
      throw new ValidationError('invalid_policy_commercials', 'Policy commercials are invalid', errors);
    }
    if (input.remarks !== undefined) SensitiveContentGuard.check(input.remarks);
    return new PolicyCommercials(Object.freeze({ ...input, ...(referredBy ? { referredBy } : {}) }));
  }

  get props(): Readonly<PolicyCommercialsProps> {
    return this.value;
  }

  renewalDate(): string | undefined {
    if (this.value.line === 'LIFE' || this.value.expiryDate === undefined) return undefined;
    return addDays(this.value.expiryDate, 1);
  }

  bookingMonth(): string {
    return this.value.bookedOn.slice(0, 7);
  }
}
