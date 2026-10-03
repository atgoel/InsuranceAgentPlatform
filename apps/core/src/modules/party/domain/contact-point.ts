import { EmailAddress, PhoneNumber } from '../../../kernel/domain';

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

  /** Same normalisation as members (kernel value objects), so hashes line up across modules. */
  private normalizePhone(phone: string): string {
    return PhoneNumber.parse(phone).e164;
  }

  private normalizeEmail(email: string): string {
    return EmailAddress.parse(email).value;
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
