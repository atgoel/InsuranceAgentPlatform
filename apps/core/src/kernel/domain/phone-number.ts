import { ValidationError } from '../errors/domain-errors';

export class PhoneNumber {
  readonly e164: string;

  private constructor(e164: string) {
    this.e164 = e164;
  }

  static parse(raw: string): PhoneNumber {
    let normalized = raw
      .replace(/[\s\-()]/g, '') // Remove spaces, dashes, parentheses
      .toLowerCase();

    // Remove leading +91
    if (normalized.startsWith('+91')) {
      normalized = normalized.substring(3);
    }
    // Remove leading 91
    else if (normalized.startsWith('91') && normalized.length === 12) {
      normalized = normalized.substring(2);
    }
    // Remove leading 0
    else if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }

    // Validate: must be 10 digits and start with 6-9
    if (!/^[6-9]\d{9}$/.test(normalized)) {
      throw new ValidationError('invalid_phone', 'Invalid phone number');
    }

    return new PhoneNumber(`+91${normalized}`);
  }

  masked(): string {
    return '+91' + '******' + this.e164.slice(-4);
  }

  equals(other: PhoneNumber): boolean {
    return this.e164 === other.e164;
  }
}
