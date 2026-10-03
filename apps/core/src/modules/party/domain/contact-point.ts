import { ValidationError } from '../../../kernel/errors/domain-errors';

export type Channel = 'MOBILE' | 'EMAIL';

export interface ContactPoint {
  readonly channel: Channel;
  readonly valueEnc: string;
  readonly valueHash: string;
  readonly masked: string;
  readonly isPrimary: boolean;
  readonly verifiedAt?: string;
}

export class ContactPointFactory {
  constructor(private cipher: { encrypt: (tenantId: string, value: string) => Promise<string>; hash: (tenantId: string, value: string) => string }) {}

  async create(tenantId: string, input: { channel: Channel; value: string; isPrimary?: boolean }): Promise<ContactPoint> {
    const normalized = this.normalize(input.channel, input.value);
    const valueEnc = await this.cipher.encrypt(tenantId, normalized);
    const valueHash = this.cipher.hash(tenantId, normalized);
    const masked = this.maskValue(input.channel, normalized);

    return {
      channel: input.channel,
      valueEnc,
      valueHash,
      masked,
      isPrimary: input.isPrimary ?? false,
    };
  }

  async hashFor(tenantId: string, channel: Channel, value: string): Promise<string> {
    const normalized = this.normalize(channel, value);
    return this.cipher.hash(tenantId, normalized);
  }

  private normalize(channel: Channel, value: string): string {
    if (channel === 'MOBILE') {
      return this.normalizePhone(value);
    }
    return this.normalizeEmail(value);
  }

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/\s+/g, '');
    const match = cleaned.match(/^\+?\d+$/);
    if (!match) {
      throw new ValidationError('invalid_phone', 'Invalid phone number format');
    }
    if (!cleaned.startsWith('+')) {
      throw new ValidationError('invalid_phone', 'Phone number must include country code');
    }
    if (cleaned.length < 10 || cleaned.length > 15) {
      throw new ValidationError('invalid_phone', 'Phone number length must be between 10 and 15 digits');
    }
    return cleaned;
  }

  private normalizeEmail(email: string): string {
    const trimmed = email.trim();
    const match = trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    if (!match) {
      throw new ValidationError('invalid_email', 'Invalid email address');
    }
    return trimmed.toLowerCase();
  }

  private maskValue(channel: Channel, value: string): string {
    if (channel === 'MOBILE') {
      if (value.length < 4) return '***';
      const last4 = value.slice(-4);
      const countryCode = value.slice(0, 3);
      const masked = countryCode + '-' + 'X'.repeat(Math.max(0, value.length - 7)) + last4;
      return masked;
    }
    const atIndex = value.indexOf('@');
    if (atIndex <= 1) return '***@***';
    const local = value.substring(0, atIndex);
    const domain = value.substring(atIndex);
    return local.charAt(0) + '***' + domain;
  }
}
