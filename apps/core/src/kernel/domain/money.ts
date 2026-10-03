import { ValidationError } from '../errors/domain-errors';

export type CurrencyCode = 'INR';

export class Money {
  readonly paise: number;
  readonly currency: CurrencyCode;

  private constructor(paise: number, currency: CurrencyCode = 'INR') {
    this.paise = paise;
    this.currency = currency;
  }

  static ofPaise(paise: number, currency: CurrencyCode = 'INR'): Money {
    if (!Number.isSafeInteger(paise)) {
      throw new ValidationError('money_not_integer', 'Amount must be an integer');
    }
    return new Money(paise, currency);
  }

  static ofRupees(rupees: number, currency: CurrencyCode = 'INR'): Money {
    // Convert to paise and round, handling floating-point precision
    const paiseExact = rupees * 100;
    const paise = this.roundHalfAwayFromZero(paiseExact);
    return new Money(paise, currency);
  }

  static zero(currency: CurrencyCode = 'INR'): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('currency_mismatch', 'Currency mismatch in addition');
    }
    return new Money(this.paise + other.paise, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('currency_mismatch', 'Currency mismatch in subtraction');
    }
    return new Money(this.paise - other.paise, this.currency);
  }

  multiplyBps(basisPoints: number): Money {
    const result = Money.roundHalfAwayFromZero((this.paise * basisPoints) / 10000);
    return new Money(result, this.currency);
  }

  isNegative(): boolean {
    return this.paise < 0;
  }

  isZero(): boolean {
    return this.paise === 0;
  }

  equals(other: Money): boolean {
    return this.paise === other.paise && this.currency === other.currency;
  }

  compare(other: Money): -1 | 0 | 1 {
    if (this.paise < other.paise) return -1;
    if (this.paise > other.paise) return 1;
    return 0;
  }

  toJSON(): { amountPaise: number; currency: CurrencyCode } {
    return {
      amountPaise: this.paise,
      currency: this.currency,
    };
  }

  format(): string {
    const isNegative = this.paise < 0;
    const absPaise = Math.abs(this.paise);
    const rupees = Math.floor(absPaise / 100);
    const paiseReminder = absPaise % 100;

    const rupeeFormatter = new Intl.NumberFormat('en-IN');
    const formattedRupees = rupeeFormatter.format(rupees);

    const sign = isNegative ? '-' : '';
    return `${sign}₹${formattedRupees}.${paiseReminder.toString().padStart(2, '0')}`;
  }

  private static roundHalfAwayFromZero(value: number): number {
    // Add a tiny epsilon to handle floating-point precision issues, then round
    const epsilon = 1e-10;
    if (value >= 0) {
      return Math.floor(value + 0.5 + epsilon);
    } else {
      return Math.ceil(value - 0.5 - epsilon);
    }
  }
}
