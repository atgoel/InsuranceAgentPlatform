import { createHmac } from 'crypto';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { PhoneNumber } from '../../../kernel/domain/phone-number';
import { LineOfBusiness } from './tie-up';

export type SignupState = 'otp_sent' | 'verified' | 'expired' | 'locked';

export interface SignupLicence {
  insurerName: string;
  line: LineOfBusiness;
  licenceNo: string;
}

export function hashOtp(otp: string, pepper: string): string {
  return createHmac('sha256', pepper).update(otp).digest('hex');
}

export class SoloSignup {
  readonly id: string;
  private internalState: SignupState;
  private internalAttempts: number;
  private internalExpiresAt: Date;
  readonly otpHash: string;
  readonly phone: PhoneNumber;
  readonly displayName: string;
  readonly licence: SignupLicence;
  readonly consentNoticeVersion: string;
  tenantId?: string;

  private constructor(
    id: string,
    state: SignupState,
    expiresAt: Date,
    otpHash: string,
    phone: PhoneNumber,
    displayName: string,
    licence: SignupLicence,
    consentNoticeVersion: string,
    attempts: number = 0,
    tenantId?: string
  ) {
    this.id = id;
    this.internalState = state;
    this.internalExpiresAt = expiresAt;
    this.otpHash = otpHash;
    this.phone = phone;
    this.displayName = displayName;
    this.licence = licence;
    this.consentNoticeVersion = consentNoticeVersion;
    this.internalAttempts = attempts;
    this.tenantId = tenantId;
  }

  static start(input: {
    id: string;
    phone: PhoneNumber;
    displayName: string;
    licence: SignupLicence;
    consentNoticeVersion: string;
    otpHash: string;
    now: Date;
  }): SoloSignup {
    const expiresAt = new Date(input.now.getTime() + 10 * 60 * 1000); // 10 minutes
    return new SoloSignup(
      input.id,
      'otp_sent',
      expiresAt,
      input.otpHash,
      input.phone,
      input.displayName,
      input.licence,
      input.consentNoticeVersion,
      0
    );
  }

  get state(): SignupState {
    return this.internalState;
  }

  get attempts(): number {
    return this.internalAttempts;
  }

  get expiresAt(): Date {
    return this.internalExpiresAt;
  }

  verify(otpHash: string, now: Date): void {
    // Check if OTP is expired
    if (now > this.internalExpiresAt) {
      this.internalState = 'expired';
      throw new BusinessRuleError('otp_expired', 'OTP has expired');
    }

    // Check if signup is still pending
    if (this.internalState !== 'otp_sent') {
      throw new BusinessRuleError('signup_not_pending', 'Signup is not in otp_sent state');
    }

    // Check OTP
    if (otpHash !== this.otpHash) {
      this.internalAttempts++;

      // Lock on 5th attempt
      if (this.internalAttempts >= 5) {
        this.internalState = 'locked';
        throw new BusinessRuleError('otp_locked', 'Too many failed attempts');
      }

      throw new BusinessRuleError('otp_invalid', 'Invalid OTP');
    }

    // Success
    this.internalState = 'verified';
  }

  attachTenant(tenantId: string): void {
    this.tenantId = tenantId;
  }
}
