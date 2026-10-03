import { ValidationError } from '../errors/domain-errors';

export class EmailAddress {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static parse(raw: string): EmailAddress {
    const trimmed = raw.trim();

    // Must contain @
    if (!trimmed.includes('@')) {
      throw new ValidationError('invalid_email', 'Invalid email address');
    }

    // Must not have multiple @
    const atCount = trimmed.split('@').length - 1;
    if (atCount !== 1) {
      throw new ValidationError('invalid_email', 'Invalid email address');
    }

    // Validate pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      throw new ValidationError('invalid_email', 'Invalid email address');
    }

    const lowercased = trimmed.toLowerCase();
    return new EmailAddress(lowercased);
  }

  masked(): string {
    const [localPart, domain] = this.value.split('@');
    return localPart.charAt(0) + '***@' + domain;
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }
}
