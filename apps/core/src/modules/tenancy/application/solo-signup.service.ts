import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, LOGGER } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { Logger } from '../../../kernel/observability/logger';
import { PhoneNumber } from '../../../kernel/domain/phone-number';
import { NotFoundError, RateLimitedError } from '../../../kernel/errors/domain-errors';
import { SignupLicence, SoloSignup, hashOtp } from '../domain/signup';
import { OTP_GENERATOR, OTP_SENDER, OtpGenerator, OtpSender, SIGNUP_REPOSITORY, SignupRepository, TENANCY_OPTIONS, TenancyOptions } from './ports';
import { ProvisionTenantService } from './provision-tenant.service';

const STARTS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;
const PLACEHOLDER_REGISTRATION_DAYS = 365;

export interface StartSignupInput {
  phone: string;
  displayName: string;
  licence: SignupLicence;
  consentNoticeVersion: string;
}

/** Solo agent self-signup with mobile OTP (F94). The raw OTP is never stored or logged — only its HMAC. */
@Injectable()
export class SoloSignupService {
  constructor(
    @Inject(SIGNUP_REPOSITORY) private readonly signups: SignupRepository,
    @Inject(OTP_GENERATOR) private readonly otps: OtpGenerator,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    @Inject(TENANCY_OPTIONS) private readonly options: TenancyOptions,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly provisioning: ProvisionTenantService,
  ) {}

  /** Serialises starts per phone so concurrent requests cannot slip past the rate limit (single instance; DB constraint in pg mode). */
  private readonly startLocks = new Map<string, Promise<unknown>>();

  async start(input: StartSignupInput): Promise<{ signupId: string; expiresAt: string }> {
    const phone = PhoneNumber.parse(input.phone);
    const previous = this.startLocks.get(phone.e164) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.startExclusive(phone, input));
    this.startLocks.set(phone.e164, run);
    try {
      return await run;
    } finally {
      if (this.startLocks.get(phone.e164) === run) this.startLocks.delete(phone.e164);
    }
  }

  private async startExclusive(phone: PhoneNumber, input: StartSignupInput): Promise<{ signupId: string; expiresAt: string }> {
    const now = this.clock.now();
    if ((await this.signups.countStartedSince(phone.e164, new Date(now.getTime() - HOUR_MS))) >= STARTS_PER_HOUR) {
      throw new RateLimitedError('signup_rate_limited', 'Too many signup attempts for this number; try again later', { retryAfterSeconds: 3600 });
    }
    const otp = this.otps.generate();
    const signup = SoloSignup.start({
      id: this.ids.next('sgn'), phone, displayName: input.displayName, licence: input.licence,
      consentNoticeVersion: input.consentNoticeVersion, otpHash: hashOtp(otp, this.options.otpPepper), now,
    });
    await this.signups.save(signup);
    await this.sender.send(phone, otp);
    this.logger.info('tenant.signup.started', 'Solo signup started', { signupId: signup.id });
    return { signupId: signup.id, expiresAt: signup.expiresAt.toISOString() };
  }

  async verify(signupId: string, otp: string): Promise<{ tenantId: string; host: string; status: string; licenceStatus: 'pending_verification' }> {
    const signup = await this.signups.get(signupId);
    if (!signup) throw new NotFoundError('Signup', signupId);
    try {
      signup.verify(hashOtp(otp, this.options.otpPepper), this.clock.now());
    } finally {
      await this.signups.save(signup); // attempts and lock state must persist even when verification fails
    }
    const result = await this.provisioning.provision(this.provisionInput(signup));
    signup.attachTenant(result.tenantId);
    await this.signups.save(signup);
    this.logger.info('tenant.signup.verified', 'Solo signup verified', { signupId, tenantId: result.tenantId });
    return { tenantId: result.tenantId, host: result.host, status: result.status, licenceStatus: 'pending_verification' };
  }

  private provisionInput(signup: SoloSignup) {
    const validTo = new Date(this.clock.now().getTime() + PLACEHOLDER_REGISTRATION_DAYS * 24 * HOUR_MS).toISOString().slice(0, 10);
    return {
      slug: `agent-${signup.phone.e164.slice(-4)}-${this.ids.next('sl').slice(-4).toLowerCase()}`,
      displayName: signup.displayName,
      kind: 'SOLO' as const,
      planCode: 'SOLO' as const,
      entity: { entityType: 'INDIVIDUAL_AGENT' as const, legalName: signup.displayName, registrationNo: signup.licence.licenceNo.toUpperCase(), registrationValidTo: validTo },
      admin: { name: signup.displayName, phone: signup.phone.e164 },
    };
  }
}
