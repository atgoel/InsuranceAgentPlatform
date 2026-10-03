import { FieldError, ValidationError } from '../../../../kernel/errors/domain-errors';

/** Versioned economic assumptions (F76); the version is stored with every run and advice record. */
export interface Assumptions {
  version: string;
  inflation: number;
  returnPreRetirement: number;
  returnPostRetirement: number;
  educationInflation: number;
  medicalInflation: number;
  lifeExpectancy: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = Object.freeze({
  version: '2026.1',
  inflation: 0.06,
  returnPreRetirement: 0.1,
  returnPostRetirement: 0.07,
  educationInflation: 0.1,
  medicalInflation: 0.12,
  lifeExpectancy: 85,
});

export interface CalcOutput<R> {
  result: R;
  workings: Array<{ label: string; value: string }>;
  assumptionsVersion: string;
}

/** ₹1,00,000 in paise. */
export const ONE_LAKH_PAISE = 10_000_000;
/** ₹100 crore in paise — upper bound for every money input. */
export const MAX_MONEY_PAISE = 100 * 10_000_000 * 100;

/** Rounds a paise amount up to the next whole ₹1 lakh. */
export function roundUpToLakh(paise: number): number {
  const whole = Math.round(paise);
  return whole <= 0 ? 0 : Math.ceil(whole / ONE_LAKH_PAISE) * ONE_LAKH_PAISE;
}

/** Rounds a paise amount up to the next whole rupee (amounts the customer must find). */
export function ceilRupee(paise: number): number {
  return Math.max(0, Math.ceil(Math.round(paise) / 100) * 100);
}

/** Rounds a paise amount down to the whole rupee (amounts the customer is projected to have). */
export function floorRupee(paise: number): number {
  return Math.max(0, Math.floor(Math.round(paise) / 100) * 100);
}

/** Future value factor of a monthly SIP paid at the start of each month for `months` at monthly rate `i`. */
export function sipFactor(i: number, months: number): number {
  if (months <= 0) return 0;
  return i === 0 ? months : ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
}

/** Monthly rate equivalent to an annual effective rate. */
export function monthlyRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/** Formats paise as ₹ with Indian digit grouping, for workings. */
export function rupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

export function percent(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

/** Collects field errors and throws one ValidationError('invalid_calculator_input'). */
export class InputCheck {
  private readonly errors: FieldError[] = [];

  money(path: string, value: unknown): this {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_MONEY_PAISE) {
      this.errors.push({ path, code: 'invalid_amount', message: 'Must be whole paise between 0 and ₹100 crore' });
    }
    return this;
  }

  integer(path: string, value: unknown, min: number, max: number): this {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      this.errors.push({ path, code: 'out_of_range', message: `Must be a whole number from ${min} to ${max}` });
    }
    return this;
  }

  rule(ok: boolean, path: string, code: string, message: string): this {
    if (!ok) this.errors.push({ path, code, message });
    return this;
  }

  get valid(): boolean {
    return this.errors.length === 0;
  }

  done(): void {
    if (this.errors.length) throw new ValidationError('invalid_calculator_input', 'Calculator input is invalid', [...this.errors]);
  }
}
