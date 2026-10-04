import { PhoneNumber } from '../../../kernel/domain/phone-number';
import { EmailAddress } from '../../../kernel/domain/email-address';
import {
  PolicyCommercials,
  PolicyCommercialsProps,
  PolicyCategory,
  lineOfCategory,
  POLICY_CATEGORIES,
} from '../../../kernel/insurance/policy-commercials';
import { CustomFieldValues } from '../../../kernel/custom-fields';
import { DomainError } from '../../../kernel/errors/domain-errors';
import { POLICY_STATUSES } from './held-policy';

function riskFields(values: Record<string, string>): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith('risk:')) continue;
    try {
      details[key.slice(5)] = JSON.parse(value);
    } catch {
      details[key.slice(5)] = value;
    }
  }
  return details;
}
function motorRisk(values: Record<string, string>, amounts: Record<string, number>) {
  return {
    registrationNo: values.registrationNo,
    registrationYear: Number(values.registrationYear),
    make: values['risk:make'],
    model: values.familySizeOrModel || values['risk:model'],
    ncbPercent: Number((values.ncb || '0').replace('%', '')),
    claimInPreviousYear: values['risk:claimInPreviousYear'] === 'true',
    odPremiumPaise: amounts.odPremium ?? 0,
    tpPremiumPaise: amounts.tpPremium ?? 0,
    addOns: [],
  };
}
function risk(values: Record<string, string>, category: PolicyCategory, amounts: Record<string, number>): ParsedPolicy['risk'] {
  const details = riskFields(values);
  if (category === 'MOTOR' && values.registrationNo)
    return { schemaId: 'motor', schemaVersion: 1, details: { ...details, ...motorRisk(values, amounts) } };
  if (!Object.keys(details).length) return undefined;
  return { schemaId: category === 'MOTOR' ? 'motor' : category.startsWith('HEALTH') ? 'health' : 'life', schemaVersion: 1, details };
}
function parseAmounts(values: Record<string, string>, mapping: Record<string, string>, problems: string[]): Record<string, number> {
  const amounts: Record<string, number> = {};
  for (const key of ['sumAssured', 'premium', 'premiumNet', 'premiumTax', 'premiumGross', 'odPremium', 'tpPremium', 'commissionAmount']) {
    if (!values[key]) continue;
    const amount = importMoney(values[key]);
    if (amount === undefined) problems.push(`invalid_amount:${mapping[key] ?? key}`);
    else amounts[key] = amount;
  }
  return amounts;
}
function parseDates(values: Record<string, string>, problems: string[]): Record<string, string> {
  const dates: Record<string, string> = {};
  for (const key of ['bookedOn', 'commencementDate', 'expiryDate', 'nextDueDate', 'maturityDate', 'renewalDate', 'dob']) {
    if (!values[key]) continue;
    const date = importDate(values[key]);
    if (!date) problems.push(`invalid_date:${key}`);
    else dates[key] = date;
  }
  return dates;
}
function premiums(
  amounts: Record<string, number>,
  problems: string[],
): Pick<PolicyCommercialsProps, 'premiumNetPaise' | 'premiumTaxPaise' | 'premiumGrossPaise'> {
  const gross = amounts.premiumGross ?? amounts.premium;
  if (gross === undefined) problems.push('required:premiumGross');
  if (amounts.commissionAmount !== undefined && amounts.premiumNet === undefined) problems.push('premium_net_required');
  const total = gross ?? 0;
  const net = amounts.premiumNet ?? total;
  const tax = amounts.premiumTax ?? total - net;
  if (tax < 0 || net + tax !== gross) problems.push('premium_mismatch');
  return { premiumNetPaise: net, premiumTaxPaise: tax, premiumGrossPaise: total };
}
function policyTerm(raw: string | undefined, problems: string[]): number | undefined {
  const match = /^(\d+)\s*(YEARS?|MONTHS?)$/i.exec(raw ?? '');
  if (raw && !match) problems.push('invalid_term');
  return match ? Number(match[1]) * (/YEAR/i.test(match[2]) ? 12 : 1) : undefined;
}
function businessSource(raw: string | undefined, warnings: string[]): PolicyCommercialsProps['businessSource'] {
  if (!raw) return undefined;
  const source = SOURCES[raw.toUpperCase()];
  if (!source) warnings.push('unknown_business_source');
  return source ?? 'OTHER';
}
function business(
  values: Record<string, string>,
  problems: string[],
  warnings: string[],
): Pick<PolicyCommercialsProps, 'businessType' | 'businessSource' | 'policyTermMonths'> {
  const types: Record<string, PolicyCommercialsProps['businessType']> = {
    PORT: 'PORTABILITY',
    PORTABILITY: 'PORTABILITY',
    FRESH: 'FRESH',
    RENEWAL: 'RENEWAL',
    ROLLOVER: 'ROLLOVER',
  };
  const businessType = types[(values.businessType || 'FRESH').toUpperCase()];
  if (!businessType) problems.push('invalid_business_type');
  return {
    businessType: businessType ?? 'FRESH',
    businessSource: businessSource(values.businessSource, warnings),
    policyTermMonths: policyTerm(values.policyTerm, problems),
  };
}
function commercialText(
  values: Record<string, string>,
): Pick<PolicyCommercialsProps, 'previousInsurerName' | 'bookingChannelCode' | 'referredBy' | 'remarks'> {
  return {
    previousInsurerName: values.previousInsurerName || undefined,
    bookingChannelCode: values.bookingChannelCode || undefined,
    referredBy: values.referredByName ? { name: values.referredByName } : undefined,
    remarks: values.remarks || undefined,
  };
}
function validateRow(values: Record<string, string>, raw: Record<string, string>, problems: string[]): void {
  for (const key of ['policyNumber', 'insurerName', 'productName', 'holderName', 'commencementDate'])
    if (!values[key]) problems.push(`required:${key}`);
  if (!MODES[(values.mode || 'ANNUAL').toUpperCase()]) problems.push('invalid_mode:mode');
  if (!(POLICY_STATUSES as readonly string[]).includes((values.status || 'IN_FORCE').toUpperCase())) problems.push('invalid_status');
  validateGrossColumns(raw, problems);
  const cls = classification(values);
  if (values.category && cls.category === 'OTHER' && !['OTHER', 'LIFE'].includes(values.category.toUpperCase()))
    problems.push('invalid_category');
}
function validateGrossColumns(raw: Record<string, string>, problems: string[]): void {
  const amounts: number[] = [];
  const moneyHeaders = [
    'finalpremium',
    'premwithgst',
    'premiumgross',
    'premiumwogst',
    'premiumnet',
    'premiumtax',
    'premium',
    'odpremium',
    'tppremium',
    'siidv',
    'sumassured',
    'commission',
    'commissionamount',
  ];
  const grossHeaders = ['finalpremium', 'premwithgst', 'premiumgross'];
  for (const [header, value] of Object.entries(raw)) {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!moneyHeaders.includes(normalized) || !value.trim()) continue;
    const parsed = importMoney(value);
    if (parsed === undefined) {
      const error = `invalid_amount:${header}`;
      if (!problems.includes(error)) problems.push(error);
      continue;
    }
    if (grossHeaders.includes(normalized)) amounts.push(parsed);
  }
  if (new Set(amounts).size > 1) problems.push('premium_mismatch');
}
function importCommercials(
  values: Record<string, string>,
  dates: Record<string, string>,
  context: { amounts: Record<string, number>; problems: string[]; warnings: string[]; asOf: string },
): PolicyCommercialsProps {
  return {
    ...classification(values),
    ...premiums(context.amounts, context.problems),
    ...business(values, context.problems, context.warnings),
    ...commercialText(values),
    bookedOn: dates.bookedOn ?? dates.commencementDate ?? context.asOf,
    commencementDate: dates.commencementDate ?? '',
    expiryDate: dates.expiryDate,
  };
}
function commission(
  values: Record<string, string>,
  amounts: Record<string, number>,
  problems: string[],
): Pick<ParsedPolicy, 'commissionAmount' | 'commissionRatePct' | 'commissionRemarks' | 'invoiceNo'> {
  const rate = values.commissionRatePct ? Number(values.commissionRatePct.replace('%', '')) : undefined;
  if (rate !== undefined && (!Number.isFinite(rate) || rate < 0 || rate > 100)) problems.push('invalid_rate');
  return {
    commissionAmount: amounts.commissionAmount,
    commissionRatePct: rate,
    commissionRemarks: values.commissionRemarks || undefined,
    invoiceNo: values.invoiceNo || undefined,
  };
}
function validateCommercials(commercials: PolicyCommercialsProps, problems: string[]): void {
  try {
    PolicyCommercials.create(commercials);
  } catch (error) {
    if (error instanceof DomainError) problems.push(error.code);
    else throw error;
  }
}
export function parseImportRow(raw: Record<string, string>, mapping: Record<string, string>, asOf: string): ParsedResult {
  const values: Record<string, string> = {};
  for (const [canonical, header] of Object.entries(mapping)) values[canonical] = raw[header]?.trim() ?? '';
  const problems: string[] = [];
  const warnings: string[] = [];
  validateRow(values, raw, problems);
  const amounts = parseAmounts(values, mapping, problems);
  const dates = parseDates(values, problems);
  const cls = classification(values);
  const commercials = importCommercials(values, dates, { amounts, problems, warnings, asOf });
  validateCommercials(commercials, problems);
  const customFields: CustomFieldValues = {};
  for (const [key, value] of Object.entries(values)) if (key.startsWith('custom:')) customFields[key.slice(7)] = value;
  const parsed: ParsedPolicy = {
    policyNumber: values.policyNumber,
    insurerName: values.insurerName,
    productName: values.productName,
    holderName: values.holderName,
    ...contacts(values, problems),
    ...commission(values, amounts, problems),
    dob: dates.dob,
    sumAssuredPaise: amounts.sumAssured,
    mode: MODES[(values.mode || 'ANNUAL').toUpperCase()] ?? 'ANNUAL',
    nextDueDate: dates.nextDueDate,
    maturityDate: dates.maturityDate,
    renewalDate: dates.renewalDate,
    status: (values.status || 'IN_FORCE').toUpperCase() as ParsedPolicy['status'],
    commercials,
    customFields,
    risk: risk(values, cls.category, amounts),
  };
  return { parsed, problems, warnings };
}
export interface ParsedPolicy {
  insurerId?: string;
  productVersionId?: string;
  policyNumber: string;
  insurerName: string;
  productName: string;
  holderName: string;
  mobile?: string;
  email?: string;
  dob?: string;
  sumAssuredPaise?: number;
  mode: 'ANNUAL' | 'HALF_YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'SINGLE';
  nextDueDate?: string;
  maturityDate?: string;
  renewalDate?: string;
  status: 'IN_FORCE' | 'GRACE' | 'LAPSED' | 'PAID_UP' | 'MATURED' | 'SURRENDERED' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED';
  commercials: PolicyCommercialsProps;
  customFields: CustomFieldValues;
  risk?: {
    schemaId: string;
    schemaVersion: number;
    details: unknown;
  };
  commissionAmount?: number;
  commissionRatePct?: number;
  commissionRemarks?: string;
  invoiceNo?: string;
}
export interface ParsedResult {
  parsed?: ParsedPolicy;
  problems: string[];
  warnings: string[];
}
export function importDate(raw: string): string | undefined {
  const s = raw.trim();
  let value = s;
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  const named = /^(\d{1,2})-([a-z]{3})-(\d{4})$/i.exec(s);
  if (numeric) value = `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  if (named) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(named[2].toLowerCase()) + 1;
    value = `${named[3]}-${String(month).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
  }
  const d = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : undefined;
}
export function importMoney(raw: string): number | undefined {
  const s = raw.trim().replace(/^₹\s*/, '').replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return undefined;
  const [whole, fraction = ''] = s.split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : undefined;
}
const MODES: Record<string, ParsedPolicy['mode']> = {
  ANNUAL: 'ANNUAL',
  YLY: 'ANNUAL',
  YEARLY: 'ANNUAL',
  HLY: 'HALF_YEARLY',
  HALF_YEARLY: 'HALF_YEARLY',
  QLY: 'QUARTERLY',
  QUARTERLY: 'QUARTERLY',
  MLY: 'MONTHLY',
  MONTHLY: 'MONTHLY',
  SSS: 'MONTHLY',
  SINGLE: 'SINGLE',
};
const SOURCES: Record<string, PolicyCommercialsProps['businessSource']> = {
  'IN HOUSE': 'IN_HOUSE',
  IN_HOUSE: 'IN_HOUSE',
  REFERRAL: 'REFERRAL',
  POSP: 'POSP',
  WALK_IN: 'WALK_IN',
  'WALK IN': 'WALK_IN',
  DIGITAL: 'DIGITAL',
  CAMPAIGN: 'CAMPAIGN',
  OTHER: 'OTHER',
};
function classification(values: Record<string, string>): {
  category: PolicyCategory;
  line: PolicyCommercialsProps['line'];
} {
  const raw = values.category?.toUpperCase() ?? 'OTHER';
  if (raw === 'HEALTH')
    return { category: values.familySizeOrModel?.toUpperCase() === 'INDIVIDUAL' ? 'HEALTH_INDIVIDUAL' : 'HEALTH_FLOATER', line: 'HEALTH' };
  if (raw === 'LIFE') return { category: 'OTHER', line: 'LIFE' };
  const category = (POLICY_CATEGORIES as readonly string[]).includes(raw) ? (raw as PolicyCategory) : 'OTHER';
  return { category, line: lineOfCategory(category) ?? ((values.line as PolicyCommercialsProps['line']) || 'LIFE') };
}
function contacts(values: Record<string, string>, problems: string[]): Pick<ParsedPolicy, 'mobile' | 'email'> {
  const result: Pick<ParsedPolicy, 'mobile' | 'email'> = {};
  for (const key of ['mobile', 'email'] as const) {
    if (!values[key]) continue;
    try {
      result[key] = key === 'mobile' ? PhoneNumber.parse(values[key]).e164 : EmailAddress.parse(values[key]).value;
    } catch {
      problems.push(`invalid_contact:${key}`);
    }
  }
  return result;
}
