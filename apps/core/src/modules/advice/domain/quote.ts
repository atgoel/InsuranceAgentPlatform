import { BusinessRuleError, ConflictError, FieldError, NotFoundError, ValidationError } from '../../../kernel/errors/domain-errors';
import { addDays, istDate } from '../../../kernel/domain/ist';
import { MAX_MONEY_PAISE } from './calculators/assumptions';

export type QuoteSource = 'MANUAL_PORTAL' | 'INSURER_API';
export type PremiumFrequency = 'ANNUAL' | 'HALF_YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'SINGLE';
export type QuoteLine = 'LIFE' | 'HEALTH' | 'GENERAL';

export interface PremiumBreakdown {
  basePaise: number;
  ridersPaise: number;
  taxPaise: number;
  totalPaise: number;
  frequency: PremiumFrequency;
}

export interface QuoteOptionProps {
  id: string;
  versionId: string;
  insurerId: string;
  source: QuoteSource;
  insurerQuoteRef?: string;
  sumAssuredPaise: number;
  policyTermYears?: number;
  premiumPayingTermYears?: number;
  premium: PremiumBreakdown;
  coverage: Array<{ label: string; value: string }>;
  exclusions: string[];
  waitingPeriods: Array<{ label: string; months: number }>;
  assumptions: Record<string, string>;
  /** ISO date (IST calendar date); expired options cannot be selected. */
  validUntil: string;
  capturedBy: string;
  capturedAt: string;
}

export type QuoteStatus = 'OPEN' | 'SHARED' | 'SELECTED' | 'EXPIRED' | 'WITHDRAWN';

export interface QuoteRequestProps {
  id: string;
  opportunityId: string;
  partyId: string;
  line: QuoteLine;
  insuredPartyIds: string[];
  requirements: Record<string, string>;
  adviceRecordId?: string;
  options: QuoteOptionProps[];
  status: QuoteStatus;
  selectedOptionId?: string;
  sharedAt?: string;
  selectedAt?: string;
  createdAt: string;
  version: number;
}

export interface ComparisonRow {
  key: string;
  label: string;
  /** One value per option, in option order; null when the option does not state it. */
  values: Array<string | number | null>;
}

export const MAX_OPTIONS = 10;
/** ValidityPolicy: an option may be valid for at most 60 days from the day it is captured. */
export const MAX_VALIDITY_DAYS = 60;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** F14/F15 quote workspace for one opportunity. Premiums are captured as quoted by the insurer, never computed. */
export class QuoteRequest {
  static open(input: {
    id: string;
    opportunityId: string;
    partyId: string;
    line: QuoteLine;
    insuredPartyIds: string[];
    requirements: Record<string, string>;
    adviceRecordId?: string;
    now: Date;
  }): QuoteRequest {
    return new QuoteRequest({
      id: input.id,
      opportunityId: input.opportunityId,
      partyId: input.partyId,
      line: input.line,
      insuredPartyIds: [...new Set(input.insuredPartyIds)],
      requirements: { ...input.requirements },
      adviceRecordId: input.adviceRecordId,
      options: [],
      status: 'OPEN',
      createdAt: input.now.toISOString(),
      version: 1,
    });
  }

  static restore(props: QuoteRequestProps): QuoteRequest {
    return new QuoteRequest(props);
  }

  private constructor(private _props: QuoteRequestProps) {}

  get props(): Readonly<QuoteRequestProps> {
    return this._props;
  }

  markSaved(): void {
    this._props = { ...this._props, version: this._props.version + 1 };
  }

  option(optionId: string): QuoteOptionProps | undefined {
    return this._props.options.find((o) => o.id === optionId);
  }

  addOption(o: QuoteOptionProps, now: Date): void {
    this.assertOpen();
    validateOption(o, istDate(now));
    if (this._props.options.length >= MAX_OPTIONS) throw new BusinessRuleError('too_many_options', `A quote can have at most ${MAX_OPTIONS} options`);
    const duplicate = this._props.options.some((x) => x.versionId === o.versionId && (x.insurerQuoteRef ?? '') === (o.insurerQuoteRef ?? ''));
    if (duplicate) throw new ConflictError('duplicate_option', 'This product and insurer quote reference are already on the quote');
    this._props = { ...this._props, options: [...this._props.options, structuredClone(o)] };
  }

  removeOption(optionId: string): void {
    if (this._props.status === 'SELECTED') throw new BusinessRuleError('quote_selected', 'Options cannot be removed after selection');
    if (!this.option(optionId)) throw new NotFoundError('quote_option', optionId);
    this._props = { ...this._props, options: this._props.options.filter((x) => x.id !== optionId) };
  }

  /** OPEN → SHARED; sharing again keeps SHARED (a fresh link can be issued). */
  markShared(now: Date): void {
    this.assertOpen();
    if (this._props.options.length === 0) throw new BusinessRuleError('quote_has_no_options', 'Add at least one option before sharing');
    this._props = { ...this._props, status: 'SHARED', sharedAt: this._props.sharedAt ?? now.toISOString() };
  }

  /** Selects one option, once; the option must still be valid on the IST date of `now`. */
  select(optionId: string, now: Date): QuoteOptionProps {
    if (this._props.status === 'SELECTED') throw new BusinessRuleError('quote_already_selected', 'An option has already been selected');
    this.assertOpen();
    const option = this.option(optionId);
    if (!option) throw new NotFoundError('quote_option', optionId);
    if (option.validUntil < istDate(now)) throw new BusinessRuleError('quote_expired', 'This quote option has expired', { validUntil: option.validUntil });
    this._props = { ...this._props, status: 'SELECTED', selectedOptionId: optionId, selectedAt: now.toISOString() };
    return option;
  }

  /** OPEN/SHARED with every option past validity → EXPIRED. */
  expireIfStale(today: string): boolean {
    if (this._props.status !== 'OPEN' && this._props.status !== 'SHARED') return false;
    if (this._props.options.length === 0 || this._props.options.some((o) => o.validUntil >= today)) return false;
    this._props = { ...this._props, status: 'EXPIRED' };
    return true;
  }

  /** Latest validity among the options (used to find stale requests). */
  get latestValidUntil(): string | undefined {
    return this._props.options.reduce<string | undefined>((max, o) => (!max || o.validUntil > max ? o.validUntil : max), undefined);
  }

  comparison(): ComparisonRow[] {
    const options = this._props.options;
    const rows: ComparisonRow[] = [
      { key: 'premium_total', label: 'Total premium', values: options.map((o) => o.premium.totalPaise) },
      { key: 'premium_frequency', label: 'Premium frequency', values: options.map((o) => o.premium.frequency) },
      { key: 'sum_assured', label: 'Sum assured', values: options.map((o) => o.sumAssuredPaise) },
      { key: 'policy_term', label: 'Policy term (years)', values: options.map((o) => o.policyTermYears ?? null) },
      { key: 'valid_until', label: 'Valid until', values: options.map((o) => o.validUntil) },
    ];
    for (const label of union(options.map((o) => o.coverage.map((c) => c.label)))) {
      rows.push({ key: `coverage:${label}`, label, values: options.map((o) => o.coverage.find((c) => c.label === label)?.value ?? null) });
    }
    rows.push({ key: 'exclusions', label: 'Exclusions', values: options.map((o) => (o.exclusions.length ? o.exclusions.join('; ') : null)) });
    for (const label of union(options.map((o) => o.waitingPeriods.map((w) => w.label)))) {
      rows.push({ key: `waiting:${label}`, label: `Waiting period: ${label} (months)`, values: options.map((o) => o.waitingPeriods.find((w) => w.label === label)?.months ?? null) });
    }
    return rows;
  }

  private assertOpen(): void {
    if (this._props.status !== 'OPEN' && this._props.status !== 'SHARED') {
      throw new BusinessRuleError('quote_closed', `The quote is ${this._props.status.toLowerCase()}`, { status: this._props.status });
    }
  }
}

/** total = base + riders + tax; whole non-negative paise; validity from today to today + 60 days. */
export function validateOption(o: QuoteOptionProps, today: string): void {
  const p = o.premium;
  const errors: FieldError[] = [];
  const money = (path: string, v: number) => {
    if (!Number.isInteger(v) || v < 0 || v > MAX_MONEY_PAISE) errors.push({ path, code: 'invalid_amount', message: 'Must be whole paise between 0 and ₹100 crore' });
  };
  money('premium.basePaise', p.basePaise);
  money('premium.ridersPaise', p.ridersPaise);
  money('premium.taxPaise', p.taxPaise);
  money('premium.totalPaise', p.totalPaise);
  money('sumAssuredPaise', o.sumAssuredPaise);
  if (errors.length) throw new ValidationError('invalid_quote_option', 'Quote option is invalid', errors);
  if (p.basePaise + p.ridersPaise + p.taxPaise !== p.totalPaise) {
    throw new ValidationError('premium_components_mismatch', 'Total premium must equal base + riders + tax', [
      { path: 'premium.totalPaise', code: 'premium_components_mismatch', message: 'Must equal base + riders + tax' },
    ]);
  }
  if (!ISO_DATE.test(o.validUntil) || o.validUntil < today || o.validUntil > addDays(today, MAX_VALIDITY_DAYS)) {
    throw new ValidationError('invalid_validity', `Validity must be from today up to ${MAX_VALIDITY_DAYS} days ahead`, [
      { path: 'validUntil', code: 'invalid_validity', message: `From today up to ${MAX_VALIDITY_DAYS} days ahead` },
    ]);
  }
}

function union(lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}
